import { existsSync, readFileSync, writeFileSync } from 'fs';
import User from './User';
import { BOT_DATA_FILENAME } from './constants';

const FILE_ENCODING = 'utf8'

class Storage {
  data: any = {};

  readData() {
    console.info('[ INFO ] Loading data from file');
    if (existsSync(BOT_DATA_FILENAME)) {
      const fileContent = readFileSync(BOT_DATA_FILENAME, FILE_ENCODING);
      const data = JSON.parse(fileContent);
      const newData: any = {};
      Object.keys(data).forEach((key: any) => {
        newData[key] = new User();
        newData[key].username = data[key].username;
        newData[key].password = data[key].password;
        newData[key].token = data[key].token;
        newData[key].state = data[key].state;
        newData[key].autoSections = data[key].autoSections;
      });
      this.data = newData; 
    }
  }
 
  writeData() {
    console.info('[ INFO ] Saving collection');
    writeFileSync(BOT_DATA_FILENAME, JSON.stringify(this.data)); 
  }
}

export default new Storage();
