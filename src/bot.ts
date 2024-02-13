import TelegramBot, { CallbackQuery, Message, SendMessageOptions } from "node-telegram-bot-api";
import dotenv from 'dotenv';
import storage from './storage-handler'
import User, { States } from "./User";
import { SIGN_FOR_SPORT } from "./constants";
import axios from "axios";

const REGISTER_CALLBACK = 'register'
const FETCH_TOKEN_CALLBACK = 'fetch_token'

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
            [{ text: 'Вход в ITMO.ID', callback_data: REGISTER_CALLBACK }]
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
              [{ text: 'Изменить данные', callback_data: REGISTER_CALLBACK }],
              [{ text: 'Повторить попытку', callback_data: FETCH_TOKEN_CALLBACK }]
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
    const data = callbackQuery.data;

    if (!messageId || !chatId || !storage.data[chatId]) {
      return;
    }

    const respond = async (text: string, options?: SendMessageOptions) => {
      this.instance?.sendMessage(chatId, text, options);
    }

    const user = storage.data[chatId] as User;

    if (data === REGISTER_CALLBACK) {
      user.state = States.LOGIN_INPUT;
      user.username = null;
      user.password = null;
      user.token = null;
      storage.writeData();
      respond('Введите ваш логин от ITMO ID:');
      return;
    }

    if (data === FETCH_TOKEN_CALLBACK) {
      if (!user.username || !user.password) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Вход в ITMO.ID', callback_data: REGISTER_CALLBACK }]
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
              [{ text: 'Изменить данные', callback_data: REGISTER_CALLBACK }],
              [{ text: 'Повторить попытку', callback_data: FETCH_TOKEN_CALLBACK }]
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
            [{ text: 'Изменить данные', callback_data: REGISTER_CALLBACK }],
            [{ text: 'Повторить попытку', callback_data: FETCH_TOKEN_CALLBACK }]
          ]
        }
      };
      respond("Проблемы с токеном", options);
      return;
    }

    try {
      const response = await axios.post(SIGN_FOR_SPORT, [Number(data)], {
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
              [{ text: 'Повторить попытку', callback_data: data }],
              [{ text: 'Изменить данные', callback_data: REGISTER_CALLBACK }],
              [{ text: 'Обновить токен', callback_data: FETCH_TOKEN_CALLBACK }]
            ]
          }
        };
        respond(`Ошибка при записи на занятие: ${response.data.error_message ?? "Неизвестная ошибка"}`, options);
      }
    } catch(ex) {
      const options: SendMessageOptions = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Повторить попытку', callback_data: data }],
            [{ text: 'Изменить данные', callback_data: REGISTER_CALLBACK }],
            [{ text: 'Обновить токен', callback_data: FETCH_TOKEN_CALLBACK }]
          ]
        }
      };
      respond(`Ошибка при записи на занятие с id:${data}`, options);
    }
  }

  async broadcast(message: string, id?: string) {
    Object.keys(storage.data).forEach(chatId => {
      const user = storage.data[chatId] as User;
      if (user.state === States.UNREGISTERED) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Вход в ITMO.ID', callback_data: REGISTER_CALLBACK }]
            ]
          }
        };
        this.instance?.sendMessage(chatId, message, options);
      }
      if (user.state === States.REGISTERED) {
        const options: SendMessageOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Записаться на занятие', callback_data: id }]
            ]
          }
        };
        this.instance?.sendMessage(chatId, message, id ? options : undefined);
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
  }

};

export default new Bot();