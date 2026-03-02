"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const searchHelper = (query) => {
    const objectSearch = {
        keyword: "",
    };
    if (query.keyword) {
        objectSearch.keyword = String(query.keyword);
        const cleaned = objectSearch.keyword.trim();
        if (cleaned) {
            objectSearch.keyword = cleaned;
            objectSearch.regex = new RegExp(cleaned, "i");
        }
        else {
            objectSearch.keyword = "";
        }
    }
    return objectSearch;
};
exports.default = searchHelper;
