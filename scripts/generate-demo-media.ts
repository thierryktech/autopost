import { ensureDemoMedia } from "../src/server/demo-media";

ensureDemoMedia()
  .then(() => console.log("Demo media ready in .data/demo-drive"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
