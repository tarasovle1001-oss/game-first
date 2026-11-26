# События игры (для модов)

Сгенерировано `pnpm events` из кода (тест следит, чтобы список был свежим). Подписка: `api.events.on("имя", (ctx, e) => ...)`, данные в `e.payload`.

| событие | данные (payload) | кто шлёт | кто слушает |
|---|---|---|---|
| `after:found` | marks, patron | secrecy.ts | - |
| `attend:ended` | loc, why | shift.ts | floor.ts |
| `attend:started` | loc, why | shift.ts | roam.ts |
| `bare:asked` | off, ok | dress.ts | annoy.ts, mind.ts |
| `bare:changed` | to, where | dress.ts | - |
| `base:invite-arrives` | id | hotel.ts, loan.ts, phone.ts | shift.ts |
| `bath:sent` | marks | rhythm.ts | - |
| `bath:walkin` | ok | rhythm.ts | mind.ts |
| `bed:after` | do, outcome, where | marriage.ts | bodystate.ts |
| `bed:continued` | act | scene.ts | - |
| `bed:ended` | act, alone, came, outcome, turns | scene.ts, marriage.ts | bodystate.ts, cage.ts, hernight.ts, look.ts, memories.ts, mind.ts, nerve.ts, rhythm.ts, terms.ts |
| `bed:her_ending` | how | scene.ts | bodystate.ts |
| `bed:lead` | given, taken | marriage.ts | bodystate.ts |
| `bed:said` | what | marriage.ts | bodystate.ts |
| `bed:save` | do, of, ok | marriage.ts | - |
| `bed:started` | act, public, shift, third | marriage.ts | hisnight.ts, crowd.ts, herside.ts, marriage.ts, mind.ts, rhythm.ts, terms.ts |
| `bed:turn` | - | scene.ts | rhythm.ts |
| `body:take` | size, stage, steps, take, zone | taking.ts | - |
| `bought` | id, kind | day.ts | - |
| `caught` | act, patron | secrecy.ts | - |
| `caught:resolved` | choice, how | secrecy.ts | expectations.ts, memories.ts, mind.ts |
| `couple:about` | say | terms.ts | - |
| `couple:allow` | item, say | terms.ts | terms.ts |
| `couple:dare` | id, ok, patron | terms.ts | - |
| `couple:guest` | do, patron | couple.ts | mind.ts, terms.ts |
| `couple:heard` | how, topic | couple.ts | memories.ts, mind.ts, terms.ts |
| `couple:kiss-after` | - | expectations.ts | - |
| `couple:permit` | act, patron, say, tone | terms.ts | - |
| `couple:press` | ok | terms.ts | - |
| `couple:stance` | patron, say | terms.ts | - |
| `couple:talk` | do, ok | couple.ts, rhythm.ts | annoy.ts, mind.ts, rhythm.ts, terms.ts |
| `couple:tell` | group, say | couple.ts | terms.ts |
| `couple:wish` | id, shock | terms.ts | - |
| `crowd:dispersed` | liked | crowd.ts | - |
| `crowd:joined` | men, patron, slot | crowd.ts | - |
| `crowd:refused` | patron | crowd.ts | - |
| `cum:landed` | act, by, where | scene.ts, crowd.ts, encounters.ts, floor.ts, marriage.ts | look.ts |
| `day:did` | do, share | day.ts | mind.ts, nerve.ts, rhythm.ts, terms.ts |
| `day:end` | day | shift.ts, engine.ts | hisnight.ts, body.ts, economy.ts, gossip.ts, hernight.ts, heroine.ts, hotel.ts, patrons.ts, secrecy.ts |
| `day:shopping` | - | day.ts | - |
| `day:start` | day | engine.ts | terms.ts |
| `day:started` | do | day.ts | - |
| `deal:asked` | act, patron, price | floor.ts | - |
| `deal:done` | ok, patron, say | floor.ts | - |
| `door` | act, how, patron | secrecy.ts | - |
| `encounter:came` | act, patron, witnessed | encounters.ts | annoy.ts, manners.ts, memories.ts, mind.ts |
| `encounter:ended` | act, came, group, loc, minutes, patron | crowd.ts, encounters.ts | bodystate.ts, crowd.ts, expectations.ts, gossip.ts, look.ts, secrecy.ts |
| `encounter:finished_self` | act, patron | crowd.ts | - |
| `encounter:proposed` | act, patron, rowIds, seen, total, verdict | encounters.ts | annoy.ts |
| `encounter:pushed` | act, far, patron | encounters.ts | annoy.ts, floor.ts, herside.ts, mind.ts, terms.ts |
| `encounter:refused` | act, patron, reaction | encounters.ts | mind.ts |
| `encounter:started` | act, came, intimate, joined, loc, patron, switched, tier, verdict, witnessed | crowd.ts, encounters.ts | bodystate.ts, couple.ts, expectations.ts, gossip.ts, herside.ts, loan.ts, look.ts, manners.ts, memories.ts, mind.ts, phone.ts, roam.ts, secrecy.ts |
| `entity:moved` | from, id, to | engine.ts | day.ts, dress.ts, marriage.ts, rhythm.ts, secrecy.ts, shift.ts, solo.ts |
| `finish:done` | patron, place | crowd.ts | - |
| `finish:refused` | offended, patron, place | crowd.ts | - |
| `floor:join` | how, ok, ruined | floor.ts | - |
| `floor:moment` | id, patron, side | floor.ts | pictures.ts |
| `floor:table` | do, patron | floor.ts | - |
| `game:init` | - | engine.ts | heroine.ts, latents.ts, mind.ts, places.ts, rhythm.ts, setup.ts |
| `group:pulled_out` | heat | floor.ts | - |
| `group:round` | heat, her | floor.ts | - |
| `gym:met` | act, intimate, patron | day.ts | - |
| `her:afternoon` | came, patron | day.ts | memories.ts |
| `her:answered` | kind, say | herside.ts | - |
| `her:approached` | kind | herside.ts | - |
| `her:asked` | act, patron | terms.ts | - |
| `her:bought` | id, kind | day.ts | memories.ts, solo.ts |
| `her:confessed` | act, patron | terms.ts | - |
| `her:followed` | patron, to | roam.ts | - |
| `her:gigolo` | came | day.ts | memories.ts |
| `her:owed` | n, why | hernight.ts | - |
| `her:remarked` | id, spoken | herside.ts | - |
| `her:started` | act, patron, seen | encounters.ts | - |
| `her:turned_down` | weight | scene.ts | hernight.ts, mind.ts |
| `her:woken` | - | rhythm.ts | mind.ts |
| `heroine:changed` | amount, key, reason | heroine.ts | mind.ts |
| `hotel:sent-up` | act, brief, patron, stays | hotel.ts | - |
| `hotel:towels` | act, hours, kind, patron | hotel.ts | - |
| `husband:act` | act, came, outcome, pleasure, turns | scene.ts, floor.ts | manners.ts, secrecy.ts |
| `husband:alone` | thought, toy | alone.ts | - |
| `husband:came_touch` | from | alone.ts, couple.ts, herside.ts | nerve.ts, pictures.ts, rhythm.ts |
| `husband:caught_alone` | toy | alone.ts | - |
| `husband:changed` | amount, key, reason | nerve.ts, rhythm.ts | - |
| `husband:countered` | asked, offer | marriage.ts | - |
| `husband:joined_alone` | - | alone.ts | - |
| `husband:refused` | act | marriage.ts | annoy.ts, hernight.ts, rhythm.ts, terms.ts |
| `husband:wet_dream` | noticed, told, who | nerve.ts | pictures.ts |
| `join:start` | act, patron | expectations.ts | marriage.ts |
| `lead` | kind | secrecy.ts | - |
| `look:marked` | by, place | look.ts | - |
| `marks:seen` | by, marks | bodystate.ts | - |
| `mode:changed` | mode, reason | secrecy.ts | - |
| `money:changed` | amount, reason | economy.ts | - |
| `night:self` | noticed, toy | hisnight.ts | - |
| `night:slipped_out` | came, noticed, patron | hisnight.ts | memories.ts |
| `outfit:changed` | by, to | manners.ts | - |
| `patron:arrived` | id, returning | shift.ts | dress.ts, gossip.ts, manners.ts |
| `patron:forgotten` | id | patrons.ts | - |
| `patron:left` | id, reason, served | shift.ts | phone.ts |
| `patron:served` | bill, by, id, tip | shift.ts | rhythm.ts |
| `phase:enter` | phase | engine.ts | annoy.ts, hisnight.ts, bodystate.ts, cage.ts, couple.ts, day.ts, dress.ts, economy.ts, hernight.ts, herside.ts, hotel.ts, loan.ts, look.ts, manners.ts, marriage.ts, mind.ts, nerve.ts, phone.ts, rhythm.ts, secrecy.ts, shift.ts, solo.ts, terms.ts |
| `phase:exit` | phase | places.ts, rhythm.ts, shift.ts, engine.ts | alone.ts, hisnight.ts, floor.ts, heroine.ts, herside.ts, hotel.ts, marriage.ts, nerve.ts, rhythm.ts, secrecy.ts, shift.ts, solo.ts, terms.ts |
| `phone:buttdial` | patron | phone.ts | - |
| `phone:call` | busy, from | phone.ts | - |
| `phone:message` | heat, key, other | phone.ts | - |
| `phone:number` | patron | phone.ts | - |
| `phone:peeked` | count, worst | phone.ts | - |
| `place:bought` | - | economy.ts | - |
| `prep:tick` | left | day.ts | annoy.ts, bodystate.ts, look.ts, mind.ts, solo.ts |
| `presented` | id, kind | day.ts | - |
| `promise:settled` | kept, kind | terms.ts | - |
| `reaction` | act, how, patron | expectations.ts | mind.ts, terms.ts |
| `shift:end` | income, served, tips | shift.ts | day.ts, economy.ts, expectations.ts, hotel.ts, secrecy.ts |
| `shift:minute` | minute | shift.ts | bodystate.ts, crowd.ts, floor.ts, look.ts, roam.ts |
| `shift:pass` | minutes | rhythm.ts | shift.ts |
| `shift:start` | - | shift.ts | expectations.ts, floor.ts, hotel.ts, loan.ts |
| `shift:tick` | tick | shift.ts | annoy.ts, body.ts, bodystate.ts, charm.ts, dress.ts, economy.ts, expectations.ts, floor.ts, heroine.ts, herside.ts, hotel.ts, loan.ts, manners.ts, mind.ts, phone.ts, rhythm.ts, terms.ts |
| `solo:did` | cut, heard, size, toy, zone | solo.ts | - |
| `solo:end` | - | day.ts | solo.ts |
| `trouble:breakdown` | cost, what | economy.ts | - |
| `trouble:theft` | taken | economy.ts | - |
| `watch:skip` | - | rhythm.ts | hisnight.ts |
