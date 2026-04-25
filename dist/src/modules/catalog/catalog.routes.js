"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catalog_data_1 = require("./catalog.data");
const router = (0, express_1.Router)();
// Public endpoint: catalog không chứa dữ liệu nhạy cảm
router.get("/industries", (_req, res) => {
    res.json({
        industries: catalog_data_1.INDUSTRIES.map((industry) => ({
            ...industry,
            levels: (0, catalog_data_1.getLevelsForIndustry)(industry.code),
        })),
        levels: Object.values(catalog_data_1.LEVELS),
    });
});
exports.default = router;
