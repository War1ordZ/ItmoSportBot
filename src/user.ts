import puppeteer from 'puppeteer';
import { LOGIN_PAGE, SCHEDULE_PAGE, TOKEN_COOKIE_NAME } from './constants';

export enum States {
  UNREGISTERED,
  LOGIN_INPUT,
  PASSWORD_INPUT,
  TOKEN_CHECK,
  REGISTERED
}

class User {
  username: string | null = null;
  password: string | null = null;
  state: States = States.UNREGISTERED;
  autoSections: string[] = [];

  token: string | null = null;

  constructor(username?: string, password?: string) {
    this.username = username ?? null;
    this.password = password ?? null;
  }

  private async getCookies() {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const browser = await puppeteer.launch(
      {
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
