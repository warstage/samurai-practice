// Copyright Felix Ungman. All rights reserved.
// Licensed under GNU General Public License version 3 or later.

import {RuntimeConfiguration} from 'warstage-runtime';
RuntimeConfiguration.autoRedirect();

import {Federation, ObjectRef, Value} from 'warstage-runtime';
import {Alliance, Commander, TeamKills, Unit, vec2} from 'warstage-runtime';
import {Match} from 'warstage-runtime';
import {Scenario, ScenarioRunner} from 'warstage-runtime';
import {Subscription} from 'rxjs';

export class SamuraiEndlessScenario implements Scenario {
    private subscription: Subscription;
    private commandInterval: any;
    private outcomeInterval: any;

    private match: Match;
    private arenaFederation: Federation;
    private battleFederation: Federation;
    private started = false;

    private enemyAlliance: Alliance;
    private enemyCommander: Commander;
    private playerAlliance: Alliance;
    private playerCommanders: Commander[];
    private waveNumber = 0;

    static findNearestUnit(units: Unit[], position: vec2): any {
        let result: Unit = null;
        let distance: number;
        units.forEach(unit => {
            const d = vec2.distanceSquared(position, unit.center);
            if (result == null || d < distance) {
                result = unit;
                distance = d;
            }
        });
        return result;
    }

    static findClusterCenter(units: Unit[]): vec2 {
        if (units.length === 0) {
            return {x: 512, y: 512};
        }

        const centerUnit = SamuraiEndlessScenario.findCenterUnit(units);
        const centerUnitCenter = centerUnit.center;
        let x = 0;
        let y = 0;
        let weight = 0;

        units.forEach(unit => {
            const unitCenter = unit.center;
            const w = 1.0 / (50 + vec2.distance(unitCenter, centerUnitCenter));
            x += w * unitCenter.x;
            y += w * unitCenter.y;
            weight += w;
        });
        return {x: x / weight, y: y / weight};
    }

    static findCenterUnit(units: Unit[]): Unit {
        if (units.length === 0) {
            return null;
        }

        const items: {u: Unit, w: number}[] = [];
        units.forEach(unit => {
            let weight = 0;
            units.forEach(u => {
                if (u !== unit) {
                    weight += 1.0 / (1.0 + vec2.distance(u.center, unit.center));
                }
            });
            items.push({u: unit, w: weight});
        });

        items.sort((a, b) => a.w - b.w);
        return items[0].u;
    }

    /***/

    constructor(private playerId: string) {
    }

    getParams(): Value {
        return {
            teamsMin: 1,
            teamsMax: 1,
            teams: [
                {slots: [{playerId: this.playerId}]},
            ],
            title: 'practice',
            map: 'Maps/Practice.png',
            options: {
                map: true,
                teams: true
            },
            started: false
        };
    }

    startup(match: ObjectRef, arenaFederation: Federation, battleFederation: Federation) {
        this.match = match as Match;
        this.arenaFederation = arenaFederation;
        this.battleFederation = battleFederation;

        this.tryStartMatch();
        this.subscription = this.arenaFederation.objects<Match>('Match').subscribe(object => {
            if (object === this.match) {
                this.tryStartMatch();
            }
        }) as any; // TODO: remove 'as any'

        this.subscription.add(this.battleFederation.objects<Unit>('Unit').subscribe(unit => {
            if ((unit.fighters$changed && !unit.fighters) || unit.deletedByGesture) {
                unit.$delete();
            }
        }));
    }

    shutdown() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
        if (this.commandInterval) {
            clearInterval(this.commandInterval);
            this.commandInterval = null;
        }
        if (this.outcomeInterval) {
            clearInterval(this.outcomeInterval);
            this.outcomeInterval = null;
        }
    }

    tryStartMatch() {
        if (this.match.started && !this.started) {
            this.started = true;
            this.onMatchStarted();
        }
    }

    onMatchStarted() {
        this.setupAlliancesAndCommanders();
        this.spawnPlayerUnits(this.playerCommanders);

        this.issueCommands();
        this.commandInterval = setInterval(() => {
            this.issueCommands();
        }, 2000);

        this.updateOutcome();
        this.outcomeInterval = setInterval(() => {
            this.updateOutcome();
        }, 250);
    }

    updateOutcome() {
        let kills = 0;
        for (const teamKill of this.battleFederation.objects<TeamKills>('TeamKills')) {
            if (teamKill.alliance === this.enemyAlliance) {
                kills = teamKill.kills;
            }
        }
        for (const team of this.match.teams) {
            if (team.score !== kills) {
                this.arenaFederation.requestService('UpdateTeam', {
                    team,
                    outcome: `Kills: ${kills}`,
                    score: kills
                }).then(() => {}, reason => {
                    console.error(reason);
                });
            }
        }
    }

    setupAlliancesAndCommanders() {
        this.enemyAlliance = this.battleFederation.objects<Alliance>('Alliance').create({
            position: 2
        });

        this.enemyCommander = this.battleFederation.objects<Commander>('Commander').create({
            alliance: this.enemyAlliance,
            playerId: '$'
        });

        this.playerAlliance = this.battleFederation.objects<Alliance>('Alliance').create({
            position: 1
        });

        this.playerCommanders = [];
        for (const team of this.match.teams) {
            for (const slot of team.slots) {
                this.playerCommanders.push(this.battleFederation.objects<Commander>('Commander').create({
                    alliance: this.playerAlliance,
                    playerId: slot.playerId
                }));
            }
        }
    }

    spawnPlayerUnits(commanders: Commander[]) {
        let index = 0;
        const count = commanders.length;
        const center = {x: 512, y: 512};
        const bearing = 0.5 * Math.PI;

        this.makePlayerUnit(commanders[index++ % count], 'SAM-BOW', 80, vec2.add(center, {x: -50, y: 0}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-ARQ', 80, vec2.add(center, {x: 0, y: 0}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-BOW', 80, vec2.add(center, {x: 50, y: 0}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-YARI', 80, vec2.add(center, {x: -25, y: -30}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-YARI', 80, vec2.add(center, {x: 25, y: -30}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-KATA', 80, vec2.add(center, {x: -50, y: -60}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'GEN-KATA', 40, vec2.add(center, {x: 0, y: -60}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-KATA', 80, vec2.add(center, {x: 50, y: -60}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'CAV-YARI', 40, vec2.add(center, {x: -70, y: -100}), bearing);
        this.makePlayerUnit(commanders[index++ % count], 'SAM-NAGI', 80, vec2.add(center, {x: 0, y: -90}), bearing);
        this.makePlayerUnit(commanders[index % count], 'CAV-BOW', 40, vec2.add(center, {x: 70, y: -100}), bearing);
    }

    makePlayerUnit(commander: Commander, unitClass: string, fighterCount: number, position: vec2, bearing: number) {
        this.battleFederation.objects<Unit>('Unit').create({
            alliance: this.playerAlliance,
            commander,
            'stats.placement': {x: position.x, y: position.y, z: bearing},
            'stats.fighterCount': fighterCount,
            'stats.unitClass': unitClass
        });
    }

    issueCommands() {
        const playerUnits: Unit[] = [];
        const scriptUnits: Unit[] = [];

        for (const unit of this.battleFederation.objects<Unit>('Unit')) {
            if (!unit.routed && unit.center != null) {
                const units = this.playerAlliance === unit.alliance ? playerUnits : scriptUnits;
                units.push(unit);
            }
        }

        if (playerUnits.length === 0) {
            return;
        }

        if (scriptUnits.length === 0) {
            this.spawnEnemyUnits(playerUnits);
            return;
        }

        const playerCenter = SamuraiEndlessScenario.findClusterCenter(playerUnits);
        const scriptCenter = SamuraiEndlessScenario.findClusterCenter(scriptUnits);

        scriptUnits.forEach(unit => {
            const unitCenter = unit.center;

            const targetUnit = SamuraiEndlessScenario.findNearestUnit(playerUnits, unitCenter);
            if (targetUnit) {
                const targetCenter = targetUnit.center;
                const range = unit['stats.maximumRange'] as number;
                if (range > 0) {
                    const diff = vec2.sub(targetCenter, unitCenter);
                    const dist = vec2.norm(diff);
                    if (dist > 0.9 * range) {
                        const destination = vec2.sub(targetCenter, vec2.mul(diff, 0.9 * range / dist));
                        this.battleFederation.requestService('UpdateCommand', {
                            unit,
                            path: [unitCenter, destination],
                            facing: vec2.angle(vec2.sub(destination, unitCenter)),
                            running: false
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    } else if (dist < 0.5 * range) {
                        const destination = vec2.sub(targetCenter, vec2.mul(diff, 0.7 * range / dist));
                        this.battleFederation.requestService('UpdateCommand', {
                            unit,
                            path: [unitCenter, destination],
                            facing: vec2.angle(vec2.sub(destination, unitCenter)),
                            running: true
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    } else {
                        this.battleFederation.requestService('UpdateCommand', {
                            unit,
                            path: [],
                            facing: vec2.angle(vec2.sub(targetCenter, unitCenter)),
                            running: false
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    }
                } else {
                    if (vec2.distance(targetCenter, unitCenter) < 80) {
                        this.battleFederation.requestService('UpdateCommand', {
                            unit,
                            path: [unitCenter, targetCenter],
                            facing: vec2.angle(vec2.sub(targetCenter, unitCenter)),
                            running: false
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    } else {
                        let diff = vec2.sub(unitCenter, scriptCenter);
                        const dist = vec2.norm(diff);
                        if (dist > 100) {
                            diff = vec2.mul(diff, 100 / dist);
                        }
                        const destination = vec2.add(playerCenter, diff);
                        this.battleFederation.requestService('UpdateCommand', {
                            unit,
                            path: [unitCenter, destination],
                            facing: vec2.angle(vec2.sub(destination, unitCenter)),
                            running: false
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    }
                }
            }
        });
    }

    spawnEnemyUnits(playerUnits: Unit[]) {
        const playerCenter = SamuraiEndlessScenario.findClusterCenter(playerUnits);
        let direction = vec2.sub({x: 512, y: 512}, playerCenter);
        const length = vec2.norm(direction);
        direction = length > 1.0 ? vec2.mul(direction, 1.0 / length) : {x: 0, y: 1};

        const center = vec2.add(playerCenter, vec2.mul(direction, 200));
        const angle = vec2.angle(direction) + 0.5 * Math.PI;

        this.makeEnemyUnits(center, angle);

        if (++this.waveNumber === 6) {
            this.waveNumber = 0;
        }
    }

    makeEnemyUnits(center: vec2, angle: number) {
        const bearing = 0.5 * Math.PI - angle;
        switch (this.waveNumber) {
            case 0:
                this.makeEnemyUnit('ASH-YARI', 80, vec2.add(center, vec2.rotate({x: -90, y: 0}, angle)), bearing);
                this.makeEnemyUnit('ASH-YARI', 80, vec2.add(center, vec2.rotate({x: -30, y: 0}, angle)), bearing);
                this.makeEnemyUnit('ASH-YARI', 80, vec2.add(center, vec2.rotate({x: 30, y: 0}, angle)), bearing);
                this.makeEnemyUnit('ASH-YARI', 80, vec2.add(center, vec2.rotate({x: 90, y: 0}, angle)), bearing);
                break;
            case 1:
                this.makeEnemyUnit('ASH-BOW', 80, vec2.add(center, vec2.rotate({x: -40, y: 0}, angle)), bearing);
                this.makeEnemyUnit('ASH-BOW', 80, vec2.add(center, vec2.rotate({x: 40, y: 0}, angle)), bearing);
                break;
            case 2:
                this.makeEnemyUnit('SAM-KATA', 80, vec2.add(center, vec2.rotate({x: -60, y: 0}, angle)), bearing);
                this.makeEnemyUnit('SAM-NAGI', 80, vec2.add(center, vec2.rotate({x: 0, y: 0}, angle)), bearing);
                this.makeEnemyUnit('SAM-KATA', 80, vec2.add(center, vec2.rotate({x: 60, y: 0}, angle)), bearing);
                break;
            case 3:
                this.makeEnemyUnit('CAV-BOW', 40, vec2.add(center, vec2.rotate({x: -60, y: 0}, angle)), bearing);
                this.makeEnemyUnit('CAV-BOW', 40, vec2.add(center, vec2.rotate({x: 60, y: 0}, angle)), bearing);
                break;
            case 4:
                this.makeEnemyUnit('CAV-YARI', 40, vec2.add(center, vec2.rotate({x: -90, y: 0}, angle)), bearing);
                this.makeEnemyUnit('SAM-KATA', 80, vec2.add(center, vec2.rotate({x: -30, y: 0}, angle)), bearing);
                this.makeEnemyUnit('SAM-KATA', 80, vec2.add(center, vec2.rotate({x: 30, y: 0}, angle)), bearing);
                this.makeEnemyUnit('CAV-YARI', 40, vec2.add(center, vec2.rotate({x: 90, y: 0}, angle)), bearing);
                break;
            case 5:
                this.makeEnemyUnit('ASH-ARQ', 80, vec2.add(center, vec2.rotate({x: -60, y: 0}, angle)), bearing);
                this.makeEnemyUnit('ASH-ARQ', 80, vec2.add(center, vec2.rotate({x: 0, y: 0}, angle)), bearing);
                this.makeEnemyUnit('ASH-ARQ', 80, vec2.add(center, vec2.rotate({x: 60, y: 0}, angle)), bearing);
                break;
        }
    }

    makeEnemyUnit(unitClass: string, fighterCount: number, position: vec2, bearing: number) {
        this.battleFederation.objects<Unit>('Unit').create({
            commander: this.enemyCommander,
            alliance: this.enemyAlliance,
            'stats.placement': {x: position.x, y: position.y, z: bearing},
            'stats.fighterCount': fighterCount,
            'stats.unitClass': unitClass,
            'stats.canNotRally': true
        });
    }
}

new ScenarioRunner((playerId: string) => new SamuraiEndlessScenario(playerId));