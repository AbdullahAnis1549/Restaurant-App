const project = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
export const publicCategory = value => project(value, ['_id','id','name','image','description','isActive']);
export function publicDish(value) {
 const result = project(value, ['_id','id','name','category','price','oldPrice','rating','numReviews','image','description','popular','special','prepTime','calories','isAvailable','spicyLevel','isVeg','variants','addons']);
 if (result.category?.name) result.category = publicCategory(result.category);
 return result;
}
export const publicBanner = value => project(value, ['_id','id','title','subtitle','discountText','buttonText','link','image','isActive']);
export const publicSettings = value => project(value, ['restaurantName','tagline','whatsappNumber','maxOrderAmount','deliverySlabs','logo','isAcceptingOrders','contactPhone','contactEmail','address','openingHours','deliveryFee','minOrderAmount','freeDeliveryThreshold']);
