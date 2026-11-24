"use strict";

const c = {
    w: "#ffffff", // white
    br: "#bc8f8f", // brown
    o: "#ffc6d00", // orange
    p: "#FF1493", // pink
    lp: "#FF69B4", // light pink
    r: "#FF0000", // red
    lr: "#FA8072", // light red
    g: "#f04ff1c", // green
    lg: "#f4ee35d", // light green
    v: "#f9f00d4", // violet
    lv: "#BA55D3", // light violet
    b: "#f004eff", // blue
    lb: "#08b3e5", // light blue
    gr: "#778899", // gray
    y: "#fdff00", // yellow
    ly: "#FFFDFF20", // light yellow
    reload: "#9966cc" // reload button
};

module.exports.categories = {
    "Card Fusion": [
        {},
        {},
        {},
        {},
        {},
        {},
        { command: "fuse 1", name: "Fuse common", color: c.w },
        { command: "fuse 2", name: "Fuse uncommon", color: c.g },
        { command: "fuse 3", name: "Fuse rare", color: c.b },
        {},
        {},
        {},
        {},
        { command: "fuse collection", name: "Collection check on/off", color: c.y },
        { command: "cardfusion register", name: "Register fragments", color: c.g },
        {},
        {},
        {},
        {},
        { command: "cardfusion stop", name: "Stop card operation", color: c.lr },
        { command: "fusestop", name: "Stop fusion", color: c.r },
        {},
        {},
        {},
        {},
        {},
        {},
        { command: "cardfusion reloadmenu", name: "Reload menu", color: c.reload }
    ]
};
