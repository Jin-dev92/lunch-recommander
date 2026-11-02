// 두 provider의 카테고리를 같은 한국어 값으로 통일한다. 이 값이 restaurants.category이자
// category_prefs.category의 키라서, 국내에서 쌓은 선호 가중치가 해외에서도 그대로 적용된다.
// 목록에 없는 값은 '기타'로 떨어뜨린다(카카오의 미등록 2단계 카테고리와 같은 취급).

const FALLBACK_CATEGORY = '기타';

/**
 * 카카오 category_name("음식점 > 한식 > 육류,고기")을 저장 키와 표시 라벨로 쪼갠다.
 * 2단계 값이 저장 키이고, 마지막 단계가 더 구체적인 화면 표시용이다.
 */
export function splitCategoryName(categoryName: string): {
  category: string;
  categoryLabel: string;
} {
  const parts = categoryName
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  const category = parts[1] ?? FALLBACK_CATEGORY;
  // 단계가 2개 이하면 더 구체적인 라벨이 없으므로 저장 키를 그대로 보여준다.
  return { category, categoryLabel: parts.length > 2 ? parts[parts.length - 1] : category };
}

// Google primaryType(영문 기계값) → 카카오와 같은 한국어 카테고리.
// 저장 키로 쓰므로 표시용 primaryTypeDisplayName이 아니라 안정적인 primaryType을 기준으로 한다.
const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
  korean_restaurant: '한식',
  chinese_restaurant: '중식',
  japanese_restaurant: '일식',
  sushi_restaurant: '일식',
  ramen_restaurant: '일식',
  italian_restaurant: '양식',
  french_restaurant: '양식',
  spanish_restaurant: '양식',
  mediterranean_restaurant: '양식',
  american_restaurant: '양식',
  pizza_restaurant: '양식',
  steak_house: '양식',
  seafood_restaurant: '양식',
  brunch_restaurant: '양식',
  breakfast_restaurant: '양식',
  fast_food_restaurant: '패스트푸드',
  hamburger_restaurant: '패스트푸드',
  sandwich_shop: '패스트푸드',
  chicken_restaurant: '치킨',
  thai_restaurant: '아시아음식',
  vietnamese_restaurant: '아시아음식',
  indian_restaurant: '아시아음식',
  indonesian_restaurant: '아시아음식',
  middle_eastern_restaurant: '아시아음식',
  turkish_restaurant: '아시아음식',
  mexican_restaurant: '아시아음식',
  bar: '술집',
  pub: '술집',
  bar_and_grill: '술집',
  wine_bar: '술집',
};

/**
 * Google 장소를 카카오와 같은 저장 키로 맞춘다.
 * displayName은 languageCode=ko로 받은 한국어 표시 문구이며 표시용으로만 쓴다.
 */
export function mapGoogleCategory(
  primaryType: string | null,
  primaryTypeDisplayName: string | null,
): { category: string; categoryLabel: string } {
  const category = (primaryType && GOOGLE_TYPE_TO_CATEGORY[primaryType]) || FALLBACK_CATEGORY;
  return { category, categoryLabel: primaryTypeDisplayName || category };
}
