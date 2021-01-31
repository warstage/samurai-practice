// Copyright Felix Ungman. All rights reserved.
// Licensed under GNU General Public License version 3 or later.

import {Navigator, Runtime, RuntimeConfiguration,} from 'warstage-runtime';
import {Scenario} from './scenario';

if (!RuntimeConfiguration.tryAutoRedirect()) {
    const runtime = new Runtime();
    runtime.startup(RuntimeConfiguration.autoDetect());
    const navigator = new Navigator(runtime);
    const scenario = new Scenario(navigator);
    navigator.lobby.onEnterLobby.subscribe(async () => {
        const match = await navigator.createMatch(scenario.getParams());
        scenario.startup(match);
    });
    navigator.battle.onEnterBattle.subscribe(() => {
    });
    navigator.lobby.onLeaveMatch.subscribe(() => {
        scenario.shutdown();
        navigator.system.federation.requestService('EnterLobby', {
            lobbyId: '000000000000000000000001' // samuraiwars.net online lobby-id
        }).then(() => {}, err => {
            console.error(err);
        })
    });
}
