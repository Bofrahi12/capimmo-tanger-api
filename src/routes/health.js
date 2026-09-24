"use strict";
const express = require("express");
const { config } = require("../config");
const { activeProvider } = require("../lib/providers");
const { countAvailable } = require("../lib/search");

const router = express.Router();
const STARTED = Date.now();

router.get("/", (req, res) => {
  const db = req.app.locals.db;
  let listings = null;
  try { listings = countAvailable(db); } catch { /* لا نكسر health */ }
  res.json({
    ok: true,
    service: "capimmo-api",
    version: "1.0.0",
    uptime_s: Math.floor((Date.now() - STARTED) / 1000),
    provider: activeProvider().name,
    listings_available: listings,
    time: new Date().toISOString(),
  });
});

module.exports = router;
