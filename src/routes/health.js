"use strict";
const express = require("express");
const { config } = require("../config");
const { activeProvider } = require("../lib/providers");
const { countAvailable } = require("../lib/search");
const { ah } = require("../lib/async");

const router = express.Router();
const STARTED = Date.now();

router.get("/", ah(async (req, res) => {
  const db = req.app.locals.db;
  let listings = null;
  try { listings = await countAvailable(db); } catch { /* لا نكسر health */ }
  res.json({
    ok: true,
    service: "capimmo-api",
    version: "1.0.0",
    uptime_s: Math.floor((Date.now() - STARTED) / 1000),
    provider: activeProvider().name,
    listings_available: listings,
    time: new Date().toISOString(),
  });
}));

module.exports = router;
