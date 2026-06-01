import arcjet, { shield, detectBot, tokenBucket } from "@arcjet/node";
import { ARCJET_KEY } from './env.js';

const aj = arcjet({
    key: ARCJET_KEY,
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({
        mode: "DRY_RUN",
        allow: [
          "CATEGORY:SEARCH_ENGINE",
        ],
      }),
      tokenBucket({
        mode: "LIVE",
        characteristics: ["ip.src"],
        refillRate: 5,
        interval: 10,
        capacity: 10,
      }),
    ],
  });

export default aj;
