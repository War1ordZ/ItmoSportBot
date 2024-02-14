import bot from "./bot";
import sportManager from "./sport-manager";
import storage from "./storage-handler";

// Ya ebal vruchnuyu mergit'
const main = async () => {
  storage.readData();
  await bot.init();
  await sportManager.init();
}

main();
