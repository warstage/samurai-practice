import {AssetLoader, Alliance, Commander, Match, Navigator, ObjectRef, TeamKills, Unit, Value, vec2, ShapeRef} from 'warstage-runtime';
import {Subscription} from 'rxjs';
import * as shapes from './shapes';
import * as units from './units';
import * as skins from './skins';
import * as lines from './lines';

export class Scenario {
    private subscription: Subscription;
    private commandInterval: any;
    private outcomeInterval: any;

    private match: Match;
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

        const centerUnit = Scenario.findCenterUnit(units);
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

    constructor(private navigator: Navigator) {
    }

    getParams(): Value {
        return {
            teamsMin: 1,
            teamsMax: 1,
            teams: [
                {slots: [{playerId: this.navigator.system.player.playerId}]},
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

    startup(match: ObjectRef) {
        this.match = match as Match;

        this.navigator.battle.federation.provideService('LoadTexture', AssetLoader.getServiceProvider());

        this.tryStartMatch();
        this.subscription = this.navigator.lobby.federation.objects<Match>('Match').subscribe(object => {
            if (object === this.match) {
                this.tryStartMatch();
            }
        }) as any; // TODO: remove 'as any'

        this.subscription.add(this.navigator.battle.federation.objects<Unit>('Unit').subscribe(unit => {
            if ((unit.fighters$changed && !unit.fighters) || unit.deletedByGesture) {
                unit.$delete();
            }
        }));

        for (const shape of shapes.vegetation) {
            this.navigator.battle.federation.objects<ShapeRef>('Shape').create(shape);
        }

        for (const shape of shapes.particles) {
            this.navigator.battle.federation.objects<ShapeRef>('Shape').create(shape);
        }

        for (const unit of Object.values(units)) {
            this.navigator.battle.federation.objects<ShapeRef>('Shape').create({
                name: unit.unitType.subunits[0].element.shape,
                size: unit.shape.size,
                skins: unit.shape.skin ? [skins[unit.shape.skin]] : null,
                lines: unit.shape.line ? [lines[unit.shape.line]] : null,
            });
        }
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
        for (const teamKill of this.navigator.battle.federation.objects<TeamKills>('TeamKills')) {
            if (teamKill.alliance === this.enemyAlliance) {
                kills = teamKill.kills;
            }
        }
        for (const team of this.match.teams) {
            if (team.score !== kills) {
                this.navigator.lobby.federation.requestService('UpdateTeam', {
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
        this.enemyAlliance = this.navigator.battle.federation.objects<Alliance>('Alliance').create({
            position: 2
        });

        this.enemyCommander = this.navigator.battle.federation.objects<Commander>('Commander').create({
            alliance: this.enemyAlliance,
            playerId: '$'
        });

        this.playerAlliance = this.navigator.battle.federation.objects<Alliance>('Alliance').create({
            position: 1
        });

        this.playerCommanders = [];
        for (const team of this.match.teams) {
            for (const slot of team.slots) {
                this.playerCommanders.push(this.navigator.battle.federation.objects<Commander>('Commander').create({
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

        this.makePlayerUnit(commanders[index++ % count], units.sam_bow, vec2.add(center, {x: -50, y: 0}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_arq, vec2.add(center, {x: 0, y: 0}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_bow, vec2.add(center, {x: 50, y: 0}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_yari, vec2.add(center, {x: -25, y: -30}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_yari, vec2.add(center, {x: 25, y: -30}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_kata, vec2.add(center, {x: -50, y: -60}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.gen_kata, vec2.add(center, {x: 0, y: -60}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_kata, vec2.add(center, {x: 50, y: -60}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.cav_yari, vec2.add(center, {x: -70, y: -100}), bearing);
        this.makePlayerUnit(commanders[index++ % count], units.sam_nagi, vec2.add(center, {x: 0, y: -90}), bearing);
        this.makePlayerUnit(commanders[index % count],   units.cav_bow, vec2.add(center, {x: 70, y: -100}), bearing);
    }

    makePlayerUnit(commander: Commander, unit: any, position: vec2, bearing: number) {
        this.navigator.battle.federation.objects<Unit>('Unit').create({
            alliance: this.playerAlliance,
            commander,
            unitType: unit.unitType,
            marker: unit.marker,
            'stats.placement': {x: position.x, y: position.y, z: bearing}
        });
    }

    issueCommands() {
        const playerUnits: Unit[] = [];
        const scriptUnits: Unit[] = [];

        for (const unit of this.navigator.battle.federation.objects<Unit>('Unit')) {
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

        const playerCenter = Scenario.findClusterCenter(playerUnits);
        const scriptCenter = Scenario.findClusterCenter(scriptUnits);

        scriptUnits.forEach(unit => {
            const unitCenter = unit.center;

            const targetUnit = Scenario.findNearestUnit(playerUnits, unitCenter);
            if (targetUnit) {
                const targetCenter = targetUnit.center;
                const range = unit['stats.maximumRange'] as number;
                if (range > 0) {
                    const diff = vec2.sub(targetCenter, unitCenter);
                    const dist = vec2.norm(diff);
                    if (dist > 0.9 * range) {
                        const destination = vec2.sub(targetCenter, vec2.mul(diff, 0.9 * range / dist));
                        this.navigator.battle.federation.requestService('UpdateCommand', {
                            unit,
                            path: [unitCenter, destination],
                            facing: vec2.angle(vec2.sub(destination, unitCenter)),
                            running: false
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    } else if (dist < 0.5 * range) {
                        const destination = vec2.sub(targetCenter, vec2.mul(diff, 0.7 * range / dist));
                        this.navigator.battle.federation.requestService('UpdateCommand', {
                            unit,
                            path: [unitCenter, destination],
                            facing: vec2.angle(vec2.sub(destination, unitCenter)),
                            running: true
                        }).then(() => {}, reason => {
                            console.error(reason);
                        });
                    } else {
                        this.navigator.battle.federation.requestService('UpdateCommand', {
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
                        this.navigator.battle.federation.requestService('UpdateCommand', {
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
                        this.navigator.battle.federation.requestService('UpdateCommand', {
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
        const playerCenter = Scenario.findClusterCenter(playerUnits);
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
                this.makeEnemyUnit(units.ash_yari, vec2.add(center, vec2.rotate({x: -90, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.ash_yari, vec2.add(center, vec2.rotate({x: -30, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.ash_yari, vec2.add(center, vec2.rotate({x: 30, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.ash_yari, vec2.add(center, vec2.rotate({x: 90, y: 0}, angle)), bearing);
                break;
            case 1:
                this.makeEnemyUnit(units.ash_bow, vec2.add(center, vec2.rotate({x: -40, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.ash_bow, vec2.add(center, vec2.rotate({x: 40, y: 0}, angle)), bearing);
                break;
            case 2:
                this.makeEnemyUnit(units.sam_kata, vec2.add(center, vec2.rotate({x: -60, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.sam_nagi, vec2.add(center, vec2.rotate({x: 0, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.sam_kata, vec2.add(center, vec2.rotate({x: 60, y: 0}, angle)), bearing);
                break;
            case 3:
                this.makeEnemyUnit(units.cav_bow, vec2.add(center, vec2.rotate({x: -60, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.cav_bow, vec2.add(center, vec2.rotate({x: 60, y: 0}, angle)), bearing);
                break;
            case 4:
                this.makeEnemyUnit(units.cav_yari, vec2.add(center, vec2.rotate({x: -90, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.sam_kata, vec2.add(center, vec2.rotate({x: -30, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.sam_kata, vec2.add(center, vec2.rotate({x: 30, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.cav_yari, vec2.add(center, vec2.rotate({x: 90, y: 0}, angle)), bearing);
                break;
            case 5:
                this.makeEnemyUnit(units.ash_arq, vec2.add(center, vec2.rotate({x: -60, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.ash_arq, vec2.add(center, vec2.rotate({x: 0, y: 0}, angle)), bearing);
                this.makeEnemyUnit(units.ash_arq, vec2.add(center, vec2.rotate({x: 60, y: 0}, angle)), bearing);
                break;
        }
    }

    makeEnemyUnit(unit: any, position: vec2, bearing: number) {
        this.navigator.battle.federation.objects<Unit>('Unit').create({
            commander: this.enemyCommander,
            alliance: this.enemyAlliance,
            unitType: unit.unitType,
            marker: unit.marker,
            'stats.placement': {x: position.x, y: position.y, z: bearing},
            'stats.canNotRally': true
        });
    }
}

