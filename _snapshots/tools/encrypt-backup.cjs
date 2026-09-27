const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');
const keyFile=path.join(__dirname,'backup-recovery-key.bin');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32),{flag:'wx'});
const key=fs.readFileSync(keyFile),[mode,source,target]=process.argv.slice(2);
if(mode==='encrypt') {
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=fs.readFileSync(source);
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 fs.writeFileSync(target+'.writing',Buffer.concat([Buffer.from('GTBK1'),iv,cipher.getAuthTag(),encrypted]));fs.renameSync(target+'.writing',target);
} else if(mode==='decrypt') {
 const data=fs.readFileSync(source);if(data.subarray(0,5).toString()!=='GTBK1')throw new Error('Unknown backup format.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(5,17));decipher.setAuthTag(data.subarray(17,33));
 fs.writeFileSync(target,Buffer.concat([decipher.update(data.subarray(33)),decipher.final()]));
} else throw new Error('Use encrypt or decrypt, source and target paths.');
