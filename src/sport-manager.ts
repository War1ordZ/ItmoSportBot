import dotenv from 'dotenv';
import User from "./User";
import _ from 'lodash';
import axios from 'axios';
import { AVAILABLE_SPORT_URL, FETCH_INTERVAL, SPORT_DEBT_URL } from './constants';
import bot from './bot';

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

class SportManager {
  private map = new Map<number, Lesson>();
  private host: User | null = null

  async init() {
    dotenv.config();
    const username = process.env.ITMO_USERNAME;
    const password = process.env.ITMO_PASSWORD;
    if (!username || !password) {
      throw "ITMO host username or password is not present in dotenv file"
    }
    this.host = await new User(username, password);
    const res = await this.host.fetchToken();
    if (res == null) {
      throw "Invalid credentials"
    }
    this.host.token = res;
    console.log("Host user is set up");

    await this.loop();

    setInterval(async () => {
      await this.loop();
    }, FETCH_INTERVAL)
  }

  async broadcastMessage() {
    
  }

  async getConfig() {
    if (!this.host) {
      return;
    }
    const oldToken = this.host.token;
    try {
      if (!this.host.token) {
        this.host.getToken();
      }
    } catch {
      this.host.token = await this.host.fetchToken();
    }

    try {
      const { data } = await axios.get(
        SPORT_DEBT_URL,
        {
          headers: {
            Authorization: `Bearer ${this.host.token}`,
          },
        }
      );
      if (data?.error_code !== 0) throw new Error('invalid response');
    } catch (e) {
      this.host.token = await this.host.fetchToken();
    }

    if (!this.host.token) throw new Error('no token');

    return {
      headers: {
        Authorization: `Bearer ${this.host.token}`,
      },
    };
  };

  async getLessons() {
    const { data } = await axios.get(
      `${AVAILABLE_SPORT_URL}?building_id=273&date_start=2024-01-01&date_end=2077-01-01`,
      await this.getConfig()
    );

    const lessons = data?.result.flatMap(
      (item: { lessons: any }) => item.lessons
    );

    return lessons;
  };

  filterLessons(lessons: Lesson[]) {
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

  filterTop(lessons: Lesson[]) {
    let all = lessons;

    all = all.filter(item => item.available > 0);

    return all;
  };

  async loop() {
    const formatDate = (date: string) => {
      const rawDate = new Date(date);
      let weekday = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'][rawDate.getDay()]
      return `${weekday} ${rawDate.getDate()}.${rawDate.getMonth() + 1}.${rawDate.getFullYear()}`
    }


    try {
      console.log(`[${new Date()}] Fetching lessons...`);
      const lessons = this.filterLessons(await this.getLessons());
      const ok = this.filterTop(lessons);

      const mapped_ok = new Map(ok.map((item: any) => [item.id, item]));
      this.map.forEach((item, key) => {
        if (!mapped_ok.has(key)) {
          console.error('WARNING! CLOSED!', item);
          const msg = `На занятии кончились места!\n`
            + `${item.section_name} ${formatDate(item.date)} в ${item.time_slot_start} у преподавателя ${item.teacher_fio}\n`
            + `${item.type_name}`;
          bot.broadcast(msg);
        }
      });

      ok.forEach((item: any) => {
        if (!this.map.has(item.id)) {
          this.map.set(item.id, item);
          console.warn('WARNING! OPEN!!!!', item);
          const msg = `На занятии есть места (${item.available} / ${item.limit})!\n`
            + `${item.section_name} ${formatDate(item.date)} в ${item.time_slot_start} у преподавателя ${item.teacher_fio}\n`
            + `${item.type_name}`;
          bot.broadcast(msg, item.id); 
        }
      });
      this.map = mapped_ok as Map<number, Lesson>;
    } catch (e) {
      console.error(e);
    }
  };
}

export default new SportManager();