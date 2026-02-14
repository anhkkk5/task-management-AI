export interface ObjectPagination {
  currentPage: number;
  limitItem: number;
  skip?: number;
  totalPage?: number;
}

const paginationHelper = (
  objPagination: ObjectPagination,
  query: Record<string, any>,
  coutRecords: number,
): ObjectPagination => {
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
  } else if (query.limit) {
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

export default paginationHelper;
