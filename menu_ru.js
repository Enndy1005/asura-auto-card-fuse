"use strict";

const c = {
    w: "#ffffff", // белый
    br: "#bc8f8f", // коричневый
    o: "#ffc6d00", // оранжевый
    p: "#FF1493", // розовый
    lp: "#FF69B4", // светло-розовый
    r: "#FF0000", // красный
    lr: "#FA8072", // светло-красный
    g: "#f04ff1c", // зеленый
    lg: "#f4ee35d", // светло-зеленый
    v: "#f9f00d4", // фиолетовый
    lv: "#BA55D3", // светло-фиолетовый
    b: "#f004eff", // синий
    lb: "#08b3e5", // светло-синий
    gr: "#778899", // серый
    y: "#fdff00", // желтый
    ly: "#FFFDFF20", // светло-желтый
    reload: "#9966cc" // цвет кнопки обновления
};

module.exports.categories = {
    "Слияние карт": [
        {},
        {},
        {},
        {},
        {},
        {},
        { command: "fuse 1", name: "Слияние обычных", color: c.w },
        { command: "fuse 2", name: "Слияние необычных", color: c.g },
        { command: "fuse 3", name: "Слияние редких", color: c.b },
        {},
        {},
        {},
        {},
        { command: "fuse collection", name: "Проверка коллекции ВКЛ/ВЫКЛ", color: c.y },
        { command: "cardfusion register", name: "Зарегистрировать фрагменты", color: c.g },
        {},
        {},
        {},
        {},
        { command: "cardfusion stop", name: "Остановить операцию с картами", color: c.lr },
        { command: "fusestop", name: "Остановить слияние", color: c.r },
        {},
        {},
        {},
        {},
        {},
        {},
        { command: "cardfusion reloadmenu", name: "Обновить меню", color: c.reload }
    ]
};
