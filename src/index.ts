import bot from "./bot";
import sportManager from "./SportManager";
import storage from "./StorageHandler";

// Ya ebal vruchnuyu mergit'
const main = async () => {
  storage.readData();
  await bot.init();
  await sportManager.init();
}

main();
