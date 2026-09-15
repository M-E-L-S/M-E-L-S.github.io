// Deterministic battle clock: UI pause stops advance(); stun freezes all boss clocks.
(function (root) {
    'use strict';
    const MIN_ATTACK_INTERVAL = 1000;
    const TIMER_EPSILON = 1e-7;
    class BossBattle {
        constructor(effects = {}) {
            this.effects = effects;
            this.hp = 400; this.playerMaxHp = 300; this.playerHp = this.playerMaxHp; this.phase = 1;
            this.state = 'interval'; this.left = 5000; this.interval = 5000; this.cap = 5000;
            this.skills = []; this.active = null; this.stun = 0; this.revival = 0;
            this.nightUnlocked = false; this.enraged = false; this.ended = false;
            this.clock = 0; this.combo = 0; this.lastMatch = -Infinity;
            this.playerMatches = 0; this.bossMatches = 0; this.competitionLeft = 0;
        }
        emit(name, ...args) { return this.effects[name]?.(...args); }
        get invincible() { return this.revival > 0 || this.active === 'contest'; }
        unlock(id, cooldown) { this.skills.push({ id, cooldown, left: 0 }); }
        cancelAttack() { this.emit('release'); this.state = 'interval'; this.left = this.interval; }
        stunFor(ms) {
            this.interval = this.cap; this.cancelAttack(); this.stun = ms;
            this.emit('stunned', ms);
            this.emit('notice', `打断成功 · 眩晕 ${ms / 1000} 秒`);
        }
        playerMatch(damage) {
            if (this.ended) return;
            if (this.active === 'contest') { this.playerMatches++; return; }
            if (this.revival) return;
            const operating = this.state === 'first' || this.state === 'second';
            this.damageBoss(damage);
            if (!this.ended && !this.revival && operating) this.stunFor(2000);
        }
        damageBoss(damage) {
            if (this.ended || this.invincible) return;
            this.hp = Math.max(0, this.hp - damage);
            this.emit('hit', 'boss', damage);
            if (this.phase === 1) {
                if (!this.nightUnlocked && this.hp <= 200) {
                    this.nightUnlocked = true; this.unlock('night', 15000);
                    this.cancelAttack(); this.emit('refill', 1);
                    this.emit('notice', '装甲破裂 · 地图补满 · 获得夜幕降临');
                }
                if (this.hp <= 1) {
                    this.hp = 1; this.stun = 0; this.revival = 10000;
                    this.active = null; this.emit('night', false); this.cancelAttack();
                    this.emit('refill', 2); this.emit('hints', 3, true);
                    this.emit('notice', 'BOSS 核心重启 · 10 秒无敌复活 · 消除冻结，可观看和点选');
                }
            } else if (this.hp <= 0) this.finish(true);
            else if (!this.enraged && this.hp <= 100) {
                this.enraged = true; this.cap = 2000;
                this.interval = Math.min(this.interval, this.cap);
                this.skills.forEach(s => { s.cooldown /= 2; s.left /= 2; });
                this.unlock('rage', 5000); this.cancelAttack(); this.emit('refill', 2);
                this.emit('notice', '危险 · 狂暴觉醒 · 攻击加速 / 技能冷却减半');
            }
        }
        damagePlayer(damage) {
            this.playerHp = Math.max(0, this.playerHp - damage);
            this.emit('hit', 'player', damage);
            if (!this.playerHp) this.finish(false);
        }
        finish(won) {
            this.ended = true; this.active = null; this.emit('night', false);
            this.emit('release'); this.emit('finish', won);
        }
        cast(skill) {
            this.active = skill.id;
            this.emit('skill', skill.id);
            if (skill.id === 'night') {
                this.skillLeft = 6000; this.emit('night', true);
                this.emit('notice', '夜幕降临 · 6 秒内图案不可见，仍可操作');
            } else if (skill.id === 'contest') {
                this.playerMatches = 0; this.bossMatches = 0; this.competitionLeft = 20000;
                this.savedIntervalLeft = this.left; this.left = 1000;
                this.emit('notice', '同台竞技 · 20 秒内挑战 4 次消除 · BOSS 无敌');
            } else {
                this.emit('shuffle'); this.emit('notice', '狂暴模式 · 剩余方块重排');
                this.endSkill();
            }
        }
        endSkill() {
            const skill = this.skills.find(s => s.id === this.active);
            if (skill) skill.left = skill.cooldown;
            this.emit('night', false); this.active = null;
        }
        endContest() {
            const count = this.playerMatches;
            this.cancelAttack(); this.left = this.savedIntervalLeft;
            this.endSkill();
            if (count < 4) {
                const damage = 50 + (4 - count) * 5;
                this.emit('notice', `竞技失败 · 消除 ${count}/4 · 受到 ${damage} 伤害`);
                this.damagePlayer(damage);
            } else {
                this.emit('hints', count === 4 ? 1 : 2, false);
                this.damageBoss(40 + (count - 4) * 5);
                if (count > 4 && !this.ended) this.stunFor(5000);
                this.emit('notice', `竞技成功 · 消除 ${count}/4 · 提示 +${count === 4 ? 1 : 2}${count > 4 ? ' · BOSS 眩晕 5 秒' : ''}`);
            }
        }
        attackStep(dt) {
            this.left = Math.max(0, this.left - dt);
            if (this.left > TIMER_EPSILON) return;
            this.left = 0;
            if (this.state === 'interval') {
                if (this.emit('reserve') === false) { this.left = 50; return; }
                this.state = 'first'; this.left = 2000;
            } else if (this.state === 'first') {
                this.state = 'second'; this.left = 2000; this.emit('first');
            } else {
                const success = this.emit('match') !== false;
                if (success) {
                    this.combo = this.clock - this.lastMatch <= 4000 ? this.combo + 1 : 1;
                    this.lastMatch = this.clock;
                    if (this.active === 'contest') this.bossMatches++;
                    else this.damagePlayer(10 + (this.combo - 1) * 5);
                }
                if (this.ended) return;
                if (success && this.active !== 'contest') this.interval = Math.max(MIN_ATTACK_INTERVAL, this.interval - 1000);
                this.cancelAttack();
                if (this.active === 'contest') this.left = 1000;
            }
        }
        advance(ms) {
            // Split at timer boundaries so long frames cannot skip attacks or phases.
            while (ms > 0 && !this.ended) {
                if (!this.stun && !this.revival && !this.active && this.state === 'interval') {
                    const ready = this.skills.find(s => !s.left);
                    if (ready) { this.cast(ready); continue; }
                }
                // Real animation frames are fractional milliseconds. Resolve a coincident
                // attack boundary before the contest deadline so the 20s mark includes
                // the fourth 5s removal instead of ending the skill a fraction early.
                if (!this.stun && !this.revival && this.left <= TIMER_EPSILON) {
                    this.attackStep(0);
                    continue;
                }
                if (this.active === 'contest' && this.competitionLeft <= TIMER_EPSILON) {
                    this.competitionLeft = 0;
                    this.endContest();
                    continue;
                }
                if (this.active === 'night' && this.skillLeft <= TIMER_EPSILON) {
                    this.skillLeft = 0;
                    this.endSkill();
                    continue;
                }
                let dt = Math.min(ms, 50);
                if (this.stun) dt = Math.min(dt, this.stun);
                else if (this.revival) dt = Math.min(dt, this.revival);
                else if (this.active === 'night') dt = Math.min(dt, this.skillLeft, this.left);
                else dt = Math.min(dt, this.left, this.active === 'contest' ? this.competitionLeft : Infinity);
                if (!this.active && this.state === 'interval' && !this.stun && !this.revival) {
                    for (const skill of this.skills) if (skill.left > 0) dt = Math.min(dt, skill.left);
                }
                ms -= dt;
                if (this.stun) { this.stun -= dt; continue; }
                if (this.revival) {
                    this.revival -= dt;
                    if (!this.revival) {
                        this.hp = 400; this.phase = 2; this.unlock('contest', 20000);
                        this.emit('notice', '复活完成 · 消除已恢复 · 第二阶段，获得同台竞技');
                    }
                    continue;
                }
                this.clock += dt;
                if (!this.active) this.skills.forEach(s => { s.left = Math.max(0, s.left - dt); });
                if (this.active === 'night') {
                    this.attackStep(dt);
                    if (this.ended) continue;
                    this.skillLeft = Math.max(0, this.skillLeft - dt);
                    if (this.skillLeft <= TIMER_EPSILON) this.endSkill();
                    continue;
                }
                if (!this.active && this.state === 'interval') {
                    const ready = this.skills.find(s => !s.left);
                    if (ready) {
                        this.left = Math.max(0, this.left - dt);
                        this.cast(ready);
                        continue;
                    }
                }
                this.attackStep(dt);
                if (this.active === 'contest' && !this.ended) {
                    this.competitionLeft = Math.max(0, this.competitionLeft - dt);
                    if (this.competitionLeft <= TIMER_EPSILON) this.endContest();
                }
            }
        }
    }
    root.BossBattle = BossBattle;
    if (typeof module !== 'undefined') module.exports = BossBattle;
})(globalThis);
