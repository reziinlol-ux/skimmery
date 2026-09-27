const crypto = require('node:crypto');
const engines = Promise.all(['roulette','chicken','tower','coinflip','wheel','double','crash'].map(name => import(`./src/casino/logic/${name}.js`)));
const cents = value => Math.round(Number(value) * 100) / 100;
const fail = (status, message) => { const error = new Error(message); error.status = status; error.publicCode = 'casino_rejected'; throw error; };
const publicState = round => {
  if (!round) return null;
  const state = { ...round.state };
  delete state.crashAt;
  if (state.floors && !round.completed) state.floors = state.floors.map(f => ({ picked: f.picked, safe: f.safe, revealed: f.picked !== null }));
  return { id: round.id, game: round.game, stake: Number(round.stake), completed: round.completed, ...state };
};
module.exports = function register({ app, pool, route, currentUser, requireSameOrigin, userTransaction, withTransaction, withinLimit, sendError, setSessionCookie, tokenHash, cleanUser, production, pendingKey }) {
  const ipHash = req => crypto.createHmac('sha256', pendingKey).update(String(req.ip).replace(/^::ffff:/,'')).digest('hex');
  const codeHash = (email, code) => crypto.createHmac('sha256', pendingKey).update(email + ':' + code).digest('hex');
  app.post('/api/auth/email/password', requireSameOrigin, route(async(req,res)=> {
    const email=String(req.body?.email || '').trim().toLowerCase(), password=String(req.body?.password || ''), signup=req.body?.mode==='signup';
    if (!pendingKey) return sendError(res,503,'email_unavailable','Email sign-in is not configured.');
    if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || password.length>128) return sendError(res,400,'invalid_credentials','Enter a valid email and a password of 8 to 128 characters.');
    await withinLimit(`password-ip:${req.ip}`,15,900);
    await withinLimit(`password-email:${email}`,10,900);
    const derive=(value,salt)=>new Promise((resolve,reject)=>crypto.scrypt(value,salt,64,(error,key)=>error?reject(error):resolve(key)));
    const token=crypto.randomBytes(32).toString('base64url');
    // Hash outside the transaction so password work does not hold database locks.
    const salt=crypto.randomBytes(16).toString('hex');
    const newHash=signup ? salt+':'+(await derive(password,salt)).toString('hex') : null;
    const found=await withTransaction(async db=> {
      await db.query("select set_config('app.email',$1,true)",[email]);
      return (await db.query('select id,username,email,picture_url,password_hash from marketplace_users where lower(email)=$1',[email])).rows[0];
    });
    if(signup && found) return sendError(res,409,'email_taken','This email already has an account. Sign in instead.');
    if(!signup) {
      const [storedSalt,storedHash]=(found?.password_hash || '00000000000000000000000000000000:'+ '0'.repeat(128)).split(':');
      const actual=await derive(password,storedSalt), expected=Buffer.from(storedHash,'hex');
      if(!found?.password_hash || expected.length!==actual.length || !crypto.timingSafeEqual(expected,actual)) return sendError(res,401,'invalid_credentials','Email or password is incorrect.');
    }
    const user=await withTransaction(async db=> {
      let account=found;
      if(signup) {
        const id=crypto.randomUUID(),username='player_'+crypto.randomBytes(5).toString('hex');
        await db.query("select set_config('app.user_id',$1,true)",[id]);
        // Unique IP and email constraints make parallel signup requests atomic.
        account=(await db.query('insert into marketplace_users(id,google_subject,email,username,password_hash) values($1,$2,$3,$4,$5) returning id,username,email,picture_url',[id,'email:'+id,email,username,newHash])).rows[0];
        await db.query('insert into marketplace_signup_ips(ip_hash,user_id) values($1,$2)',[ipHash(req),id]);
        await db.query('insert into marketplace_wallets(user_id) values($1)',[id]);
      }
      await db.query("select set_config('app.user_id',$1,true)",[account.id]);
      await db.query("insert into marketplace_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '30 days')",[account.id,tokenHash(token)]);
      return account;
    });
    setSessionCookie(res,token);res.json({user:cleanUser(user)});
  }));
  app.post('/api/auth/email/request', requireSameOrigin, route(async (req,res) => {
    if (!pendingKey) return sendError(res,503,'email_unavailable','Email sign-in is not configured.');
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res,400,'invalid_email','Enter a valid email address.');
    await withinLimit(`email-send:${req.ip}`, 5, 900);
    await withinLimit(`email-address:${email}`, 3, 900);
    const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
    if (!configured && production) return sendError(res,503,'email_unavailable','Email delivery is being configured. Please try again later.');
    const code = String(crypto.randomInt(100000,1000000));
    await pool.query(`insert into marketplace_email_codes(email,code_hash,ip_hash,expires_at) values($1,$2,$3,now()+interval '10 minutes') on conflict(email) do update set code_hash=excluded.code_hash,ip_hash=excluded.ip_hash,attempts=0,expires_at=excluded.expires_at`, [email,codeHash(email,code),ipHash(req)]);
    if (configured) {
      const result = await fetch('https://api.resend.com/emails', { method:'POST', signal:AbortSignal.timeout(10000), headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from:process.env.EMAIL_FROM, to:[email], subject:'Your Marketplace sign-in code', text:`Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.` }) });
      if (!result.ok) { await pool.query('delete from marketplace_email_codes where email=$1 and code_hash=$2',[email,codeHash(email,code)]); return sendError(res,503,'email_delivery_failed','The code could not be sent. Try again shortly.'); }
    }
    res.json({ ok:true, ...(!configured && !production ? { developmentCode:code } : {}) });
  }));
  app.post('/api/auth/email/verify', requireSameOrigin, route(async(req,res) => {
    if (!pendingKey) return sendError(res,503,'email_unavailable','Email sign-in is not configured.');
    await withinLimit(`email-verify:${req.ip}`, 15, 900);
    const email=String(req.body?.email || '').trim().toLowerCase(), code=String(req.body?.code || '');
    if (!/^\d{6}$/.test(code)) return sendError(res,400,'invalid_code','Enter the six-digit code.');
    const token=crypto.randomBytes(32).toString('base64url');
    const result=await withTransaction(async db => {
      const saved=(await db.query('select * from marketplace_email_codes where email=$1 for update',[email])).rows[0];
      if (!saved || saved.attempts>=5 || new Date(saved.expires_at).getTime()<Date.now()) return {error:'This code expired. Request a new one.'};
      await db.query('update marketplace_email_codes set attempts=attempts+1 where email=$1',[email]);
      if (saved.code_hash!==codeHash(email,code) || saved.ip_hash!==ipHash(req)) return {error:'The code is incorrect. Use the same device that requested it.'};
      await db.query("select set_config('app.email',$1,true)",[email]);
      let user=(await db.query('select id,username,email,picture_url from marketplace_users where lower(email)=$1',[email])).rows[0];
      if (!user) {
        const taken=(await db.query('select user_id from marketplace_signup_ips where ip_hash=$1',[ipHash(req)])).rows[0];
        if (taken) return {error:'An account has already been created from this IP address.'};
        const id=crypto.randomUUID(), username='player_'+crypto.randomBytes(5).toString('hex');
        await db.query("select set_config('app.user_id',$1,true)",[id]);
        user=(await db.query('insert into marketplace_users(id,google_subject,email,username) values($1,$2,$3,$4) returning id,username,email,picture_url',[id,'email:'+id,email,username])).rows[0];
        await db.query('insert into marketplace_signup_ips(ip_hash,user_id) values($1,$2)',[ipHash(req),id]);
        await db.query('insert into marketplace_wallets(user_id) values($1)',[id]);
      }
      await db.query("select set_config('app.user_id',$1,true)",[user.id]);
      await db.query("insert into marketplace_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '30 days')",[user.id,tokenHash(token)]);
      await db.query('delete from marketplace_email_codes where email=$1',[email]);
      return {user};
    });
    if (result.error) return sendError(res,409,'email_verification_failed',result.error);
    setSessionCookie(res,token);res.json({user:cleanUser(result.user)});
  }));
  app.get('/api/casino/state', currentUser, route(async(req,res)=> {
    const data=await userTransaction(req,async db=> {
      await db.query('insert into casino_wallets(user_id) values($1) on conflict do nothing',[req.user.id]);
      const wallet=(await db.query('select balance from casino_wallets where user_id=$1',[req.user.id])).rows[0];
      const round=(await db.query('select * from casino_rounds where user_id=$1 and not completed',[req.user.id])).rows[0];
      return { balance:Number(wallet.balance), activeRound:publicState(round) };
    });res.json(data);
  }));
  app.post('/api/casino/action', requireSameOrigin, currentUser, route(async(req,res)=> {
    const [roulette,chicken,tower,coin,wheel,double,crash]=await engines;
    const {action,game,options={},roundId,actionId}=req.body || {};
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actionId || '')) return sendError(res,400,'invalid_action','Invalid action ID.');
    const result=await userTransaction(req,async db=> {
      await db.query('insert into casino_wallets(user_id) values($1) on conflict do nothing',[req.user.id]);
      const wallet=(await db.query('select balance from casino_wallets where user_id=$1 for update',[req.user.id])).rows[0];
      const replay=(await db.query('select response from casino_actions where user_id=$1 and action_id=$2',[req.user.id,actionId])).rows[0];
      if (replay) return replay.response;
      let balance=Number(wallet.balance), round, outcome=null, payout=0, completed=false;
      if (action==='start') {
        const active=(await db.query('select id from casino_rounds where user_id=$1 and not completed',[req.user.id])).rows[0];
        if (active) fail(409,'Finish your current round first.');
        const stake=cents(req.body.stake);
        if (!Number.isFinite(stake) || stake<10 || stake>balance || stake>1000000) fail(400,'Enter a bet between 10 credits and your available balance.');
        if (!['roulette','coin-flip','tower','chicken-cross','wheel','double','crash'].includes(game)) fail(400,'Unknown game.');
        round={id:crypto.randomUUID(),game,stake,state:{}};
        balance=cents(balance-stake);
        if (game==='roulette') {
          const bets=options.bets;
          if (!Array.isArray(bets) || bets.length>100 || !bets.length) fail(400,'Choose your roulette bets.');
          const normalized=bets.map(bet=> {
            const definition=bet.type==='number' && Number.isInteger(bet.value) && bet.value>=0 && bet.value<=36 ? { key:'number-'+bet.value,type:'number',value:bet.value,count:1 } : roulette.rouletteGroups.find(group=>group.key===bet.key);
            if (!definition || !Number.isFinite(bet.amount) || bet.amount<=0 || cents(bet.amount)!==bet.amount) fail(400,'Invalid roulette bet.');
            return {...definition,amount:bet.amount};
          });
          if (cents(normalized.reduce((sum,b)=>sum+b.amount,0))!==stake) fail(400,'Bet amounts do not match.');
          outcome=roulette.spinRoulette();payout=roulette.settleRoulette(normalized,outcome).returned;completed=true;
        } else if(game==='coin-flip') {
          if (!['heads','tails'].includes(options.side)) fail(400,'Choose heads or tails.');
          outcome=coin.flipCoin();payout=coin.settleCoinFlip(options.side,outcome,stake).returned;completed=true;
        } else if(game==='tower') {
          if(!tower.TOWER_DIFFICULTIES[options.difficulty]) fail(400,'Choose a difficulty.');
          round.state={difficulty:options.difficulty,cleared:0,floors:tower.createTower(options.difficulty)};
        } else if(game==='chicken-cross') {
          if(!chicken.CROSS_DIFFICULTIES[options.difficulty]) fail(400,'Choose a difficulty.');
          round.state={difficulty:options.difficulty,steps:0};
        } else if(game==='double') {
          if(!double.DOUBLE_OUTCOMES.some(item=>item.key===options.pick)) fail(400,'Choose a Double outcome.');
          outcome=double.spinDouble();payout=double.doublePayout(stake,options.pick,outcome);completed=true;
        } else if(game==='crash') {
          const autoCashout=options.autoCashout===undefined || options.autoCashout===null || options.autoCashout==='' ? null : Number(options.autoCashout);
          if(autoCashout!==null && (!Number.isFinite(autoCashout) || autoCashout<1.5 || autoCashout>100)) fail(400,'Crash auto cashout must be between 1.50× and 100×.');
          round.state={startedAt:Date.now(),crashAt:crash.sampleCrashPoint(),multiplier:1,autoCashout};
        } else {
          if(!wheel.WHEEL_RISKS[options.risk]) fail(400,'Choose a risk.');
          round.state={risk:options.risk,wins:0,multiplier:1};
        }
      } else {
        round=(await db.query('select * from casino_rounds where user_id=$1 and id=$2 and not completed for update',[req.user.id,roundId])).rows[0];
        if(!round) fail(409,'This round has already ended. Refresh your balance.');
        round.stake=Number(round.stake);
      }
      const state=round.state;
      if(action==='crash-check' && round.game==='crash') {
        const currentMultiplier=crash.crashMultiplier(Date.now()-state.startedAt);
        state.multiplier=currentMultiplier;
        const autoCashedOut=state.autoCashout!==null && state.autoCashout!==undefined && state.autoCashout<state.crashAt && currentMultiplier>=state.autoCashout;
        const crashed=!autoCashedOut && currentMultiplier>=state.crashAt;
        if(crashed) { state.multiplier=state.crashAt;completed=true; }
        else if(autoCashedOut) { state.multiplier=state.autoCashout;payout=crash.crashPayout(round.stake,state.autoCashout);completed=true; }
        outcome={crashed,autoCashedOut,currentMultiplier:crashed?state.crashAt:autoCashedOut?state.autoCashout:currentMultiplier};
      } else if(round.game==='wheel' && (action==='start' || action==='spin')) {
        outcome=wheel.spinWheel(state.risk,state.wins);state.lastOutcome=outcome;
        if(outcome.multiplier===null) completed=true;
        else { state.multiplier=wheel.multiplyWheelMultiplier(state.multiplier,outcome.multiplier);state.wins+=1; if(state.wins===8) {completed=true;payout=wheel.wheelCashout(round.stake,state.multiplier);} }
      } else if(action==='cross' && round.game==='chicken-cross') {
        outcome={survives:chicken.crossSurvives(state.difficulty,state.steps)};
        if(!outcome.survives) completed=true;
        else { state.steps+=1;if(state.steps===chicken.CROSS_STEPS) { completed=true;payout=chicken.crossCashout(round.stake,state.steps,state.difficulty); } }
      } else if(action==='pick' && round.game==='tower') {
        const tile=Number(options.tile);
        if(!Number.isInteger(tile) || tile<0 || tile>3) fail(400,'Choose a tile.');
        const index=state.cleared, selected=tower.revealTowerPick(state.floors[index],tile);
        state.floors[index]=selected;outcome={picked:tile,safe:selected.safe,index};
        if(!selected.safe) completed=true;
        else { state.cleared+=1;if(state.cleared===tower.TOWER_FLOORS) {completed=true;payout=tower.towerCashout(round.stake,state.cleared,state.difficulty);} }
      } else if(action==='cashout') {
        if(round.game==='wheel' && state.wins>0) payout=wheel.wheelCashout(round.stake,state.multiplier);
        else if(round.game==='chicken-cross' && state.steps>0) payout=chicken.crossCashout(round.stake,state.steps,state.difficulty);
        else if(round.game==='tower' && state.cleared>0) payout=tower.towerCashout(round.stake,state.cleared,state.difficulty);
        else if(round.game==='crash') {
          const currentMultiplier=crash.crashMultiplier(Date.now()-state.startedAt);
          const autoCashedOut=state.autoCashout!==null && state.autoCashout!==undefined && state.autoCashout<state.crashAt && currentMultiplier>=state.autoCashout;
          const crashed=!autoCashedOut && currentMultiplier>=state.crashAt;
          outcome={crashed,autoCashedOut,cashout:!crashed,currentMultiplier:crashed?state.crashAt:autoCashedOut?state.autoCashout:currentMultiplier};
          if(crashed) state.multiplier=state.crashAt;
          else { const payoutMultiplier=autoCashedOut?state.autoCashout:currentMultiplier;state.multiplier=payoutMultiplier;payout=crash.crashPayout(round.stake,payoutMultiplier); }
        }
        else fail(409,'Make a successful move before cashing out.');
        completed=true;
      } else if(action==='abandon') completed=true;
      else if(action!=='start') fail(400,'This action is unavailable.');
      const debitBalance=balance;
      if(completed) balance=cents(balance+payout);
      round.completed=completed;
      await db.query('update casino_wallets set balance=$2,updated_at=now() where user_id=$1',[req.user.id,balance]);
      if(action==='start') await db.query('insert into casino_rounds(id,user_id,game,stake,state,completed) values($1,$2,$3,$4,$5,$6)',[round.id,req.user.id,round.game,round.stake,JSON.stringify(state),completed]);
      else await db.query('update casino_rounds set state=$2,completed=$3 where id=$1',[round.id,JSON.stringify(state),completed]);
      const response={balance,debitBalance,payout,completed,outcome,round:publicState(round)};
      await db.query('insert into casino_actions(user_id,action_id,response) values($1,$2,$3)',[req.user.id,actionId,JSON.stringify(response)]);
      return response;
    });res.json(result);
  }));
};
