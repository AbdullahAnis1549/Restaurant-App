import { createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) { let bits=0,value=0,result='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)result+=alphabet[(value<<(5-bits))&31];return result; }
function decode32(text){let bits=0,value=0,out=[];for(const char of text){const n=alphabet.indexOf(char);if(n<0)throw Error('Invalid authenticator key');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export const newAuthenticatorSecret=()=>base32(randomBytes(20));
export function totp(secret,step=Math.floor(Date.now()/30000),digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const digest=createHmac('sha1',decode32(secret)).update(counter).digest();const offset=digest.at(-1)&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');}
export function matchedStep(secret,code,now=Date.now()){if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))return null;const step=Math.floor(now/30000);for(const delta of [0,-1,1]){const candidate=step+delta;if(candidate>=0&&timingSafeEqual(Buffer.from(totp(secret,candidate)),Buffer.from(code)))return candidate;}return null;}
export function dataKey(){const value=process.env.SECURITY_DATA_KEY;if(!/^[a-f0-9]{64}$/i.test(value||''))throw Object.assign(Error('Account security encryption is not configured.'),{status:503});return Buffer.from(value,'hex');}
export function sealSecret(secret,userId){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',dataKey(),iv);cipher.setAAD(Buffer.from('zaykora-mfa:'+userId));const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join('.');}
export function openSecret(value,userId){const[iv,tag,data]=value.split('.');const decipher=createDecipheriv('aes-256-gcm',dataKey(),Buffer.from(iv,'hex'));decipher.setAAD(Buffer.from('zaykora-mfa:'+userId));decipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString('utf8');}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const recoveryHash=(userId,code)=>digest('recovery:'+userId+':'+code.replace(/-/g,'').toLowerCase());

export const emailCodeHash=(challengeId,code)=>createHmac('sha256',dataKey()).update('email:'+challengeId+':'+code).digest('hex');
