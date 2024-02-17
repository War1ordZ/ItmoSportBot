import puppeteer from 'puppeteer';
import { LOGIN_PAGE, SCHEDULE_PAGE, TOKEN_COOKIE_NAME, TOKEN_FETCH_INTERVAL } from './Constants';

export enum States {
  UNREGISTERED,
  LOGIN_INPUT,
  PASSWORD_INPUT,
  TOKEN_CHECK,
  REGISTERED
}

export const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресение'];
export const TIMES = ['8:20', '10:00', '11:40', '13:30', '15:20', '17:00', '18:40', '20:20']

class User {
  username: string | null = null;
  password: string | null = null;
  state: States = States.UNREGISTERED;
  autoSections: string[] = [];
  autoDays: string[] = [...DAYS];
  autoTime: string[] = [...TIMES];

  token: string | null = null;

  constructor(username?: string, password?: string) {
    this.username = username ?? null;
    this.password = password ?? null;

    setInterval(async () => {
      this.token = await this.fetchToken() ?? this.token;
    }, TOKEN_FETCH_INTERVAL);
  }

  private async getCookies() {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const browser = await puppeteer.launch(
      {
        args: ['--no-sandbox'],
        headless: 'new',
      }
    );
    const page = await browser.newPage();
    await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle0' });
    delay(1000);
    await page.type('#username', this.username || '');
    await page.type('#password', this.password || '');
    await page.type('#rememberMe', 'on');
    delay(1000);
    await Promise.all([page.click('#kc-login'), page.waitForNavigation()]);

    await page.goto(SCHEDULE_PAGE, {
      waitUntil: 'domcontentloaded',
    });

    const cookies = await page.cookies();
    await browser.close();
    return cookies;
  };

  async fetchToken(): Promise<string | null> {
    const [tokenCookie] = (await this.getCookies()).filter(cookie => cookie.name === TOKEN_COOKIE_NAME);
    return tokenCookie?.value.substring(9);
  }

  async getToken() {
    if (!this.token) {
      const token = await this.fetchToken();
      this.token = token;
    }

    return this.token;
  }

  addAutoSection(section: string) {
    console.log(section)
    if (new Set(this.autoSections).has(section)) {
      return false;
    } 
    this.autoSections = [...this.autoSections, section]; 
    return true;
  }

  removeAutoSection(section: string) {
    this.autoSections = this.autoSections.filter(it => it != section);
  }

  clearAutoSections() {
    this.autoSections = [];
  }
};

export default User;
