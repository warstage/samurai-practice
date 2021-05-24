// Copyright Felix Ungman. All rights reserved.
// Licensed under GNU General Public License version 3 or later.

import {Navigator, Runtime, RuntimeConfiguration} from 'warstage-runtime';
import {Scenario} from './scenario';

if (!RuntimeConfiguration.tryAutoRedirect()) {
    const runtime = new Runtime();
    runtime.startup(RuntimeConfiguration.autoDetect());
    const navigator = new Navigator(runtime);
    let scenario = new Scenario(navigator);
    navigator.lobby.onEnterLobby.subscribe(async () => {
        if (scenario) {
            const match = await navigator.createMatch(scenario.getParams());
            scenario.startup(match);
        }
    });
}
