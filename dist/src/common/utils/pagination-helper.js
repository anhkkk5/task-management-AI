"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const paginationHelper = (objPagination, query, coutRecords) => {
    if (query.page) {
        const page = parseInt(String(query.page), 10);
        if (Number.isFinite(page) && page > 0) {
            objPagination.currentPage = page;
        }
    }
    if (query.limitItem) {
        const limitItem = parseInt(String(query.limitItem), 10);
        if (Number.isFinite(limitItem) && limitItem > 0) {
            objPagination.limitItem = limitItem;
        }
    }
    else if (query.limit) {
        const limit = parseInt(String(query.limit), 10);
        if (Number.isFinite(limit) && limit > 0) {
            objPagination.limitItem = limit;
        }
    }
    objPagination.skip =
        (objPagination.currentPage - 1) * objPagination.limitItem;
    objPagination.totalPage = Math.ceil(coutRecords / objPagination.limitItem);
    return objPagination;
};
exports.default = paginationHelper;
