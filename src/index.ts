import bot from "./bot";
import sportManager from "./SportManager";
import storage from "./StorageHandler";

const main = async () => {
  storage.readData();
  await bot.init();
  await sportManager.init();
}

main();
