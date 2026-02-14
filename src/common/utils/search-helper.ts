export interface ObjectSearch {
  keyword: string;
  regex?: RegExp;
}

const searchHelper = (query: Record<string, any>): ObjectSearch => {
  const objectSearch: ObjectSearch = {
    keyword: "",
  };

  if (query.keyword) {
    objectSearch.keyword = String(query.keyword);

    const cleaned = objectSearch.keyword.trim();
    if (cleaned) {
      objectSearch.keyword = cleaned;
      objectSearch.regex = new RegExp(cleaned, "i");
    } else {
      objectSearch.keyword = "";
    }
  }

  return objectSearch;
};

export default searchHelper;
