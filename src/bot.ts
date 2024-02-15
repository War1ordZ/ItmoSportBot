import TelegramBot, { CallbackQuery, EditMessageCaptionOptions, EditMessageReplyMarkupOptions, Message, SendMessageOptions } from "node-telegram-bot-api";
import dotenv from 'dotenv';
import storage from './StorageHandler'
import { SIGN_FOR_SPORT } from "./Constants";
import axios, { Axios, AxiosResponse } from "axios";
import sportManager from "./SportManager";
import User, { DAYS, States, TIMES } from "./User";

const REGISTER_CALLBACK = 'register';
const FETCH_TOKEN_CALLBACK = 'fetch_token';
const APPLY_FOR_LESSON_CALLBACK = 'apply_for_lesson';
const SHOW_AUTO_MENU_CALLBACK = 'auto_menu'
const TOGGLE_AUTO_DAY_CALLBACK = 'Z'
const TOGGLE_AUTO_TIME_CALLBACK = 'X'
const SHOW_AUTO_TIME_MENU_CALLBACK = 'time_auto_menu'
const SHOW_AUTO_DAY_MENU_CALLBACK = 'day_auto_menu'
const AUTO_APPLY_FOR_LESSON_CALLBACK = 'aafl';
const AUTO_APPLY_FOR_LESSON_DISABLE_CALLBACK = 'daafl';

class Bot {
  instance: TelegramBot | null = null;

  private async handleMessage(msg: Message) {
    const chatId = msg.chat.id;
    const respond = async (text: string, options?: SendMessageOptions) => {
      this.instance?.sendMessage(chatId, text, options);
    }

    if (!storage.data[chatId]) {
      const options: SendMessageOptions = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Вход в ITMO.ID', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }]
          ]
        }
      };
      await respond("Бот для записи на физкультуру. Можно войти в аккаунт через ITMO ID для быстрой записи через бота", options);
      storage.data[chatId] = new User();
      storage.writeData();
      return;
    }

    const user = storage.data[chatId] as User;
    const message = msg.text;

    if (!message) {
      await respond("Нормально общайся ёпта");
      return;
    }

    if (message === '/help') {
      await respond('Бот для упрощения записи на физкультуру\n\nСписок команд:\n'
        + '/help - Вывести это меню\n'
        + '/profile - Вывести информацию о пользователе\n'
        + '/auto - Открыть меню автозаписи');
      return;
    }

    if (message === '/profile') {
      const getState = (state: States) => {
        if (state === States.UNREGISTERED) {
          return 'Не зарегистрирован';
        }
        if (state === States.LOGIN_INPUT) {
          return 'Запрошен логин';
        }
        if (state === States.PASSWORD_INPUT) {
          return 'Запрошен пароль';
        }
        if (state === States.TOKEN_CHECK) {
          return 'Валидация токена';
        }
        if (state === States.REGISTERED) {
          return 'Зарегистрирован';
        }
      }

      await respond(`${user.username ? `Логин ITMO.ID: ${user.username}` : `Вы не вошли в ITMO.ID`}\n`
        + `Статус токена: ${user.state === States.REGISTERED ? 'ОК' : `${user.token ? 'Не подтверждён' : 'Не запрашивался'}`}\n`
        + `${!user.autoSections.length ? 'У вас нет секций для автозаписи' : `Автозапись на секции: ${user.autoSections.join(', ')}`}\n`
        + `Статус пользователя: ${getState(user.state)}`);
      return;
    }

    if (message === '/auto') {
      if (user.state !== States.REGISTERED) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Изменить данны для входа', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
              [{ text: 'Обновить токен', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
            ]
          }
        };
        respond('Функция доступна только для зарегистрированных пользователей', options);
        return;
      }
      const options: SendMessageOptions = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Вывести список предметов", callback_data: JSON.stringify({ id: SHOW_AUTO_MENU_CALLBACK }) }],
            [{ text: "Настройки автозаписи по времени", callback_data: JSON.stringify({ id: SHOW_AUTO_TIME_MENU_CALLBACK }) }],
            [{ text: "Настройки автозаписи по дням", callback_data: JSON.stringify({ id: SHOW_AUTO_DAY_MENU_CALLBACK }) }],
          ]
        }
      };
      await respond("Выберите опцию", options);
      return;
    }

    if (user.state === States.LOGIN_INPUT) {
      user.state = States.PASSWORD_INPUT;
      user.username = message;
      storage.writeData();
      await respond('Введите ваш пароль от ITMO ID:');
      return;
    }

    if (user.state === States.PASSWORD_INPUT) {
      user.state = States.REGISTERED;
      user.password = message;
      storage.writeData();
      await respond('Данные введены, получение токена...');
      user.state = States.TOKEN_CHECK;
      storage.writeData();
      const token = await user.fetchToken();
      if (token) {
        user.token = token;
        user.state = States.REGISTERED;
        storage.writeData();
        respond("Токен был успешно получен и добавлен в систему!");
      } else {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
              [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
            ]
          }
        };
        respond("Ошибка получения токена!", options);
      }
      return;
    }
  }

  private async handleCallbackQuery(callbackQuery: CallbackQuery) {
    const messageId = callbackQuery.message?.message_id;
    const chatId = callbackQuery.message?.chat.id;
    const data = JSON.parse(callbackQuery.data!!);
    const callbackId = data.id;

    if (!messageId || !chatId || !storage.data[chatId]) {
      return;
    }

    const respond = async (text: string, options?: SendMessageOptions) => {
      this.instance?.sendMessage(chatId, text, options);
    }

    const user = storage.data[chatId] as User;

    if (callbackId === REGISTER_CALLBACK) {
      user.state = States.LOGIN_INPUT;
      user.username = null;
      user.password = null;
      user.token = null;
      storage.writeData();
      respond('Введите ваш логин от ITMO ID:');
      return;
    }

    if (callbackId === FETCH_TOKEN_CALLBACK) {
      if (!user.username || !user.password) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Вход в ITMO.ID', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }]
            ]
          }
        };
        respond("Данные пользователя не введены", options);
        return;
      }
      const token = await user.fetchToken();
      if (token) {
        user.state = States.REGISTERED;
        user.token = token;
        storage.writeData();
        respond("Токен был успешно получен и добавлен в систему!");
      } else {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
              [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
            ]
          }
        };
        respond("Ошибка получения токена!", options);
      }
      return;
    }

    if (!user.token) {
      const options: SendMessageOptions = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
            [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
          ]
        }
      };
      respond("Проблемы с токеном", options);
      return;
    }

    if (callbackId === SHOW_AUTO_MENU_CALLBACK) {
      const sections = await sportManager.getLessonNames();
      sections.forEach(async (it) => {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Включить автозапись", callback_data: JSON.stringify({ id: AUTO_APPLY_FOR_LESSON_CALLBACK, lesson: it }) }],
              [{ text: "Выключить автозапись", callback_data: JSON.stringify({ id: AUTO_APPLY_FOR_LESSON_DISABLE_CALLBACK, lesson: it }) }],
            ]
          }
        };
        await respond(`Автозапись на секцию "${it}"`, options);
      })
      return;
    }

    if (callbackId === SHOW_AUTO_DAY_MENU_CALLBACK) {
      const options: SendMessageOptions = {
        reply_markup: {
          inline_keyboard: [
            ...DAYS.map((it, index) => 
              [{ text: `${it} ${user.autoDays.includes(it) ? '✅' : '❌'}`, callback_data: JSON.stringify({ id: TOGGLE_AUTO_DAY_CALLBACK, day: index, message: null, chat: chatId }) }]
            )
          ]
        }
      };
      await respond(`Настройка дней`, options);
      return;
    }

    if (callbackId === TOGGLE_AUTO_DAY_CALLBACK) {
      const day = DAYS[data.day];
      const chat = data.chat;
      const message = data.message ?? messageId;

      if (user.autoDays.includes(day)) {
        user.autoDays = user.autoDays.filter(it => it !== day); 
      } else {
        user.autoDays.push(day);
      }
      storage.writeData();

      const options: EditMessageReplyMarkupOptions = {
        chat_id: chat,
        message_id: message,
        inline_message_id: message
      };

      this.instance?.editMessageReplyMarkup({
        inline_keyboard: [
          ...DAYS.map((it, index) => 
            [{ text: `${it} ${user.autoDays.includes(it) ? '✅' : '❌'}`, callback_data: JSON.stringify({ id: TOGGLE_AUTO_DAY_CALLBACK, day: index, message: message, chat: chat  }) }]
          )
        ]
      }, options);

      return;
    }

    if (callbackId === SHOW_AUTO_TIME_MENU_CALLBACK) {
      const options: SendMessageOptions = {
        reply_markup: {
          inline_keyboard: [
            ...TIMES.map((it, index) => 
              [{ text: `${it} ${user.autoTime.includes(it) ? '✅' : '❌'}`, callback_data: JSON.stringify({ id: TOGGLE_AUTO_TIME_CALLBACK, day: index, message: null, chat: chatId }) }]
            )
          ]
        }
      };
      await respond(`Настройка времени`, options);
      return;
    }

    if (callbackId === TOGGLE_AUTO_TIME_CALLBACK) {
      const time = TIMES[data.time]; 
      const chat = data.chat;
      const message = data.message ?? messageId;

      if (user.autoTime.includes(time)) {
        user.autoTime = user.autoTime.filter(it => it !== time); 
      } else {
        user.autoTime.push(time);
      }
      storage.writeData();

      const options: EditMessageReplyMarkupOptions = {
        chat_id: chat,
        message_id: message,
        inline_message_id: message
      };

      this.instance?.editMessageReplyMarkup({
        inline_keyboard: [
          ...TIMES.map((it, index) => 
            [{ text: `${it} ${user.autoTime.includes(it) ? '✅' : '❌'}`, callback_data: JSON.stringify({ id: TOGGLE_AUTO_TIME_CALLBACK, time: index, message: message, chat: chat  }) }]
          )
        ]
      }, options);

      return;
    }

    if (callbackId === APPLY_FOR_LESSON_CALLBACK) {
      try {
        const response = await axios.post(SIGN_FOR_SPORT, [Number(data.lesson)], {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        })
        if (response.status === 200) {
          respond("Успешно!");
        } else {
          const options: SendMessageOptions = {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: APPLY_FOR_LESSON_CALLBACK, lesson: data.lesson }) }],
                [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
                [{ text: 'Обновить токен', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
              ]
            }
          };
          respond(`Ошибка при записи на занятие: ${response.data.error_message ?? "Неизвестная ошибка"}`, options);
        }
      } catch (ex : any) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: APPLY_FOR_LESSON_CALLBACK, lesson: data.lesson }) }],
              [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
              [{ text: 'Обновить токен', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
            ]
          }
        };
        this.instance?.sendMessage(chatId, `Ошибка при записи на занятие: ${ex.response.data.error_message}`, options);
      }
    }

    if (callbackId === AUTO_APPLY_FOR_LESSON_CALLBACK) {
      respond(`${user.addAutoSection(data.lesson) ? `Автозапись на "${data.lesson}" включена` : `Автозапись на "${data.lesson}" уже была включена`}`)
      storage.writeData();
      return
    }
    if (callbackId ===AUTO_APPLY_FOR_LESSON_DISABLE_CALLBACK) {
      user.removeAutoSection(data.lesson)
      storage.writeData();
      respond(`Автозапись на ${data.lesson} отключена`)
      return
    }
  }

  async broadcast(message: string, name: string, time_start: string, day: string, id?: string) {
    Object.keys(storage.data).forEach(async chatId => {
      const user = storage.data[chatId] as User;
      if (user.state === States.UNREGISTERED) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Вход в ITMO.ID', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }]
            ]
          }
        };
        await this.instance?.sendMessage(chatId, message, options);
      }
      if (user.state === States.REGISTERED) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Записаться на занятие', callback_data: JSON.stringify({ id: APPLY_FOR_LESSON_CALLBACK, lesson: id }) }]
            ]
          }
        };
        this.instance?.sendMessage(chatId, message, id ? options : undefined);
        if (user.autoSections.includes(name) && user.autoTime.includes(time_start) && user.autoDays.includes(day)) {
          if (!id) {
            return;
          }
          this.instance?.sendMessage(chatId, `Попытка автоматической записи на занятие "${name}", ID: ${id}`);
          try {
            const response = await axios.post(SIGN_FOR_SPORT, [Number(id)], {
              headers: {
                Authorization: `Bearer ${user.token}`
              }
            })
            if (response.status === 200) {
              this.instance?.sendMessage(chatId, "Успешно!");
            } else {
              const options: SendMessageOptions = {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: APPLY_FOR_LESSON_CALLBACK, lesson: id }) }],
                    [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
                    [{ text: 'Обновить токен', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
                  ]
                }
              };
              this.instance?.sendMessage(chatId, `Ошибка при записи на занятие: ${response.data.error_message ?? "Неизвестная ошибка"}`, options);
            }
          } catch (ex : any) {
            const options: SendMessageOptions = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Повторить попытку', callback_data: JSON.stringify({ id: APPLY_FOR_LESSON_CALLBACK, lesson: id }) }],
                  [{ text: 'Изменить данные', callback_data: JSON.stringify({ id: REGISTER_CALLBACK }) }],
                  [{ text: 'Обновить токен', callback_data: JSON.stringify({ id: FETCH_TOKEN_CALLBACK }) }]
                ]
              }
            };
            this.instance?.sendMessage(chatId, `Ошибка при записи на занятие: ${ex.response.data.error_message}`, options);
          }
        }
      }
    })
  }

  async init() {
    dotenv.config();
    const token = process.env.BOT_TOKEN;
    if (!token) {
      throw "Telegram bot token is not present in dotenv file"
    }
    this.instance = new TelegramBot(token, { polling: true })
    console.log('[ INFO ] Bot is set up');
    this.instance.on('message', (msg: Message) => this.handleMessage(msg));
    this.instance.on('callback_query', (callbackQuery: CallbackQuery) => this.handleCallbackQuery(callbackQuery));
    this.instance.setMyCommands([
      { command: 'help', description: 'Показать меню с информацией' },
      { command: 'profile', description: 'Показать информацию о профиле' },
      { command: 'auto', description: 'Открыть меню автозаписи' },
    ]);
  }

};

export default new Bot();