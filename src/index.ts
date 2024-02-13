import puppeteer from 'puppeteer';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import _ from 'lodash';
import dotenv from 'dotenv';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import moment from 'moment';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not defined in .env');
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const chatIdFile = 'chats.json';

// Read chat IDs from file
let chatIds: number[] = [];
if (existsSync(chatIdFile)) {
  const fileContent = readFileSync(chatIdFile, 'utf8');
  chatIds = JSON.parse(fileContent);
}

bot.on('message', (msg: Message) => {
  const chatId = msg.chat.id;
  if (!chatIds.includes(chatId)) {
    chatIds.push(chatId);
    bot.sendMessage(chatId, 'Chat added to list!');
    // Save new chat ID to file
    writeFileSync(chatIdFile, JSON.stringify(chatIds));
  } else {
    bot.sendMessage(
      chatId,
      `current avaliable: \`\`\`json\n${JSON.stringify(
        Array.from(map.entries()),
        null,
        2
      )}\n\`\`\``,
      {
        parse_mode: 'MarkdownV2',
      }
    );
  }
});
const broadcastMessage = (message: string) => {
  chatIds.forEach(chatId => {
    bot
      .sendMessage(chatId, message, { parse_mode: 'Markdown' })
      .catch(error =>
        console.error(`Failed to send message to ${chatId}:`, error)
      );
  });
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const getCookies = async () => {
  const browser = await puppeteer.launch(
    {
      headless: 'new',
    }
    // {
    //   headless: false,
    // }
  );
  const page = await browser.newPage();

  console.log('browser launched');
  console.log(await page.cookies());

  // Navigate to the login page
  await page.goto('https://my.itmo.ru/login', { waitUntil: 'networkidle0' });
  // await page.waitForNavigation()

  console.log('gogogo');

  await delay(1000);

  // Fill in the login form
  await page.type('#username', process.env.ITMO_USERNAME || '');
  await page.type('#password', process.env.ITMO_PASSWORD || '');
  await page.type('#rememberMe', 'on');

  console.log('filled with');

  await Promise.all([page.click('#kc-login'), page.waitForNavigation()]);
  console.log('wait done ');

  await page.goto('https://my.itmo.ru/schedule', {
    waitUntil: 'domcontentloaded',
  });
  await delay(1000);

  const cock = await page.cookies();

  await browser.close();

  return cock;
};

let token: string | null = null;

const setToken = () => {
  console.log('writing token');
  writeFileSync('./token.txt', token || '');
};

const getToken = () => {
  console.log('reading token');
  token = readFileSync('./token.txt').toString();
};

const refreshToken = () => {};

const check = async () => {};

const fetchToken = async () => {
  console.log('fetching token...');
  const cookies = await getCookies();
  console.log(cookies);
  const mapped = Object.fromEntries(
    cookies.map(item => {
      return [item.name, item];
    })
  );
  // console.log(cookies)

  token = mapped['auth._id_token.itmoId']?.value || null;
};

const getConfig = async () => {
  const old = token;
  try {
    if (token === null) getToken();
    // const jwt = jwtDecode(token || '');
    // if (new Date((jwt?.exp || 0) * 1000 + 1000 * 60) < new Date()) {
    //   console.log('old token', jwt?.exp);
    //   await fetchToken();
    // }
  } catch (e) {
    await fetchToken();
  }

  try {
    const { data } = await axios.get(
      'https://my.itmo.ru/api/sport/my_sport/debt',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (data?.error_code !== 0) throw new Error('invalid response');
  } catch (e) {
    await fetchToken();
  }

  if (old !== token) setToken();

  if (!token) throw new Error('no token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const decodeToken = (item: any, bearer = false) => {
  const decoded = decodeURI(item.value);
  const token = bearer ? decoded.split(' ')[1] : decoded;
  const jwt = jwtDecode(token);
  return jwt;
};

const getLessons = async () => {
  const url = `https://my.itmo.ru/api/sport/my_sport/schedule/available?building_id=273&date_start=${moment().format(
    'YYYY-MM-DD'
  )}&date_end=${moment().add(21, 'days').format('YYYY-MM-DD')}`;
  console.log(url);

  const { data } = await axios.get(url, await getConfig());

  const lessons = data?.result.flatMap(
    (item: { lessons: any }) => item.lessons
  );

  return lessons;
};

const getSelected = async () => {
  const { data } = await axios.get(
    'https://my.itmo.ru/api/sport/my_sport/schedule/lessons_table',
    await getConfig()
  );

  const selected = data.result;
  writeFileSync('./selected.json', JSON.stringify(selected, null, 2));

  return selected;
};

const getLimits = async () => {
  const { data } = await axios.get(
    'https://my.itmo.ru/api/sport/my_sport/schedule/available/limits',
    await getConfig()
  );

  return data;
};

type Lesson = {
  id: number;
  section_name: string;
  type_name: string;
  room_name: string;
  limit: number;
  available: number;
  teacher_fio: string;

  date: string;
  date_end: string;
  time_slot_start: string;
  time_slot_end: string;
};

type FullLesson = Lesson & {
  other_lessons?: Partial<Lesson>;
};

const keys = [
  'id',
  'section_name',
  'type_name',
  'room_name',
  'available',
  'teacher_fio',
  'date',
  'date_end',
  'time_slot_start',
  'time_slot_end',
  'limit',
];

const filterLessons = (lessons: Lesson[]) => {
  let all = lessons;

  all = all.map(item =>
    _.pickBy(item, (value, key) => keys.includes(key))
  ) as Lesson[];

  all = all.filter(
    item =>
      item.type_name.includes('задолженност') &&
      item.room_name.includes('ул.Ломоносова') &&
      new Date(item.date) > new Date()
  );

  return all;
};

const filterTop = (lessons: Lesson[]) => {
  let all = lessons;

  all = all.filter(item => item.available > 0);

  return all;
};

let map = new Map<number, Lesson>();

const loop = async () => {
  try {
    console.log(`[${new Date()}]fetching lessons...`);
    const lessons = filterLessons(await getLessons());
    writeFileSync('./lessons.json', JSON.stringify(lessons, null, 2));
    const ok = filterTop(lessons);
    writeFileSync('./ok.json', JSON.stringify(lessons, null, 2));

    const mapped_ok = new Map(ok.map(item => [item.id, item]));
    map.forEach((item, key) => {
      if (!mapped_ok.has(key)) {
        console.error('WARNING! CLOSED!', item);
        const msg = `WARNING! CLOSED!🤯🤯🤯 \n\`\`\`json\n${JSON.stringify(
          item,
          null,
          2
        )}\n\`\`\``;
        broadcastMessage(msg);
      }
    });

    ok.forEach(item => {
      if (!map.has(item.id)) {
        map.set(item.id, item);
        console.warn('WARNING! OPEN!!!!', item);
        const msg = `WARNING! OPEN!✅✅✅ \n\`\`\`json\n${JSON.stringify(
          item,
          null,
          2
        )}\n\`\`\``;
        broadcastMessage(msg);
      }
    });
    map = mapped_ok;
  } catch (e) {
    console.error(e);
  }
};
const main = async () => {
  await loop();

  setInterval(async () => {
    await loop();
  }, 10 * 1000);
};

main();
