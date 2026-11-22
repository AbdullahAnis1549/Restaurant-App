export const IMAGE_WIDTHS = { thumb: 160, card: 480, detail: 960, banner: 1280, logo: 192 };
export function imageUrlForSize(input, size = 'card') {
 if (typeof input !== 'string' || !input) return input;
 const width = IMAGE_WIDTHS[size] || IMAGE_WIDTHS.card;
 let url; try { url = new URL(input); } catch { return input; }
 if (url.protocol !== 'https:' || url.searchParams.has('__cld_token__') || url.searchParams.has('s') || url.searchParams.has('signature') || url.searchParams.has('token') || url.searchParams.has('Expires') || url.searchParams.has('X-Amz-Signature')) return input;
 if (url.hostname === 'res.cloudinary.com') {
  const match = url.pathname.match(/^(\/[^/]+\/image\/upload\/)(.+)$/);
  if (!match || /^(s--|[^/]*[,!])/.test(match[2])) return input;
  url.pathname = match[1] + 'c_limit,w_' + width + ',h_' + width + '/f_webp,q_auto:eco/' + match[2];
  return url.toString();
 }
 if (url.hostname === 'images.unsplash.com') {
  url.searchParams.set('w', String(width)); url.searchParams.set('h', String(width)); url.searchParams.set('fit', 'max'); url.searchParams.set('dpr', '1'); url.searchParams.set('q', '65'); url.searchParams.set('fm', 'webp'); url.searchParams.delete('auto');
  return url.toString();
 }
 return input;
}

export function imageDeliveryReplacer(key, value) {
 if (key === 'imageVariants' || key === 'logoVariants' || !value || typeof value !== 'object' || Array.isArray(value)) return value;
 let result = value;
 for (const field of ['image', 'logo']) if (typeof value[field] === 'string' && value[field]) {
  const variants = Object.fromEntries(Object.keys(IMAGE_WIDTHS).map(size => [size, imageUrlForSize(value[field], size)]));
  if (variants.card !== value[field]) result = { ...result, [field + 'Variants']: variants };
 }
 return result;
}
