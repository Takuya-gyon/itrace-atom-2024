'use babel';

/****************************************************************************************************************************
 ****************************
 * @file FILE.EXT
 *
 * @copyright (C) 2022 i-trace.org
 *
 * This file is part of iTrace Infrastructure http://www.i-trace.org/.
 * iTrace Infrastructure is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
 * License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * iTrace Infrastructure is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along with iTrace Infrastructure. If not, see
 * https://www.gnu.org/licenses/.
 ************************************************************************************************************************
 ********************************/

/* eslint-disable import/no-unresolved, no-loop-func  */
/* global atom */

import { CompositeDisposable } from 'atom';
import path from 'path';
import LoggingSession from './session';

const AppState = {
  Connected: 1,
  Started: 3,
  Stopped: 4,
  Disconnected: 2,
  Locked: 5
};

// socket vars
const net = require('net');

let iTraceSocket = null;
let toolBar;
let highlightState = 0;

module.exports = {
  subscriptions: null,
  activate() {

    this.subscriptions = new CompositeDisposable();
    //initの処理を定義（submenuの中身を変えるだけ？）
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'iTrace-atom:init': () => {
          const iTraceMenu = atom.menu.template.find(item => {
            return item.label === 'iTrace Atom';
          });
          iTraceMenu.submenu = [];
          iTraceMenu.submenu.push({
            label: 'Connect to iTrace Core',
            command: 'iTrace-atom:connect'
          });
          iTraceMenu.submenu.push({
            label: 'Disconnect from iTrace Core',
            command: 'iTrace-atom:disconnect',
            enabled: 'false'
          });
          iTraceMenu.submenu.push({
            label: 'Word Highlight On',
            command: 'iTrace-atom:word_highlight_on',
            enabled: 'true'
          });
          iTraceMenu.submenu.push({
            label: 'Highlight Off',
            command: 'iTrace-atom:highlight_off',
            enabled: 'true'
          });
          atom.menu.update();
          atom.notifications.addSuccess('Plugin initialized.');
        }
      })
    );

    //connect時の処理を定義
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'iTrace-atom:connect': () => {
          atom.notifications.addInfo('Connecting to iTrace core...');

          iTraceSocket = new net.Socket();

          // handle connection failure
          let hasInitError = false;

          const ita = this;

          // bind events
          iTraceSocket.on('connect', function(e) {
            atom.notifications.addSuccess('Connected to iTrace Core, Listening for tracking start');

            ita.startListening();

            if (!hasInitError) {
              ita._setMenuState(AppState.Connected);
            }
          });
          iTraceSocket.on('error', function(e) {
            atom.notifications.addError(
              'Error: Unable to connect to iTrace core. Please ensure iTrace Core is running.'
            );

            hasInitError = true;
          });
          iTraceSocket.on('close', function(e) {
            ita.stopListening();
            ita._setMenuState(AppState.Disconnected);
            atom.notifications.addWarning('iTrace Core disconnected.');
          });

          iTraceSocket.connect({
            host: '127.0.0.1',
            port: 8008
          });
        }
      })
    );

    //disconnect時の処理を定義
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'iTrace-atom:disconnect': () => {
          iTraceSocket.destroy();

          this._setMenuState(AppState.Disconnected);
        }
      })
    );

    //単語ハイライト機能オン処理を定義
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
          'iTrace-atom:word_highlight_on': () => {
            highlightState = 1;
            atom.notifications.addSuccess('word highlight On');
          }
        }
      )
    )

    //ハイライト機能オフ処理を定義
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
          'iTrace-atom:highlight_off': () => {
            highlightState = 0;
            atom.notifications.addSuccess('highlight Off');
          }
        }
      )
    )
  },

  deactivate() {
    this.subscriptions.dispose();
    // if (toolBar) {
    //   toolBar.removeItems();
    //   toolBar = null;
    // }
  },

  startListening() {
    const ita = this;

    iTraceSocket.on('data', function(data) {
      ita._handleData(ita, data);
    });
  },

  stopListening() {
    const ita = this;

    atom.notifications.addWarning('Stopped logging...');

    if (ita._loggingSession && ita._loggingSession.getSessionActive()) {
      ita._loggingSession.endSession();
    }
    this._setMenuState(AppState.Stopped);
  },

  /**
   * @param {module.exports} ita
   * @param {*} data
   */
  async _handleData(ita, data) {
    const log_time_ms = Date.now();

    data = data || [];
    const dataArr = parseAscii(data).split(',');

    //Note: nice constants Please
    //dataArr[0]: "command"
    //dataArr[1]: CurrentSessionId
    //dataArr[2]: CurrentSessionTimeStamp
    //dataArr[3]: DataRootDir
    //source: SessionManager.cs in iTrace Core

    // if data starts with a 'session_start', start
    // if data start with a 'session_end', end
    // if data starts with a 'gaze', write a gaze

    if (dataArr[0].indexOf('session_start') >= 0) { //計測開始時
      this._setMenuState(AppState.Started);
      atom.notifications.addSuccess('Logging started by iTrace Core.');
      const path = dataArr[3].substring(0, dataArr[3].indexOf('\n'));
      const session_id = dataArr[1];
      const fileTimestamp = dataArr[2];
      ita._loggingSession = new LoggingSession(path, fileTimestamp, session_id, highlightState);
      ita._loggingSession.startSession();
    } else if (dataArr[0].indexOf('session_end') >= 0) {
      atom.notifications.addInfo('Logging ended by iTrace Core.');
      ita.stopListening();
    } else if (dataArr[0].indexOf('gaze') >= 0 && ita._loggingSession.getSessionActive()) {
      const eventId = dataArr[dataArr.length - 3].trim();
      if (eventId) {
        eventId.trim();
      }
      const x = dataArr[dataArr.length - 2].trim();
      const y = dataArr[dataArr.length - 1].trim();

      this._loggingSession.logPoint(x, y, eventId, log_time_ms);
    }

    function parseAscii(data) {
      let retStr = '';
      for (let i = 0; i < data.length; i++) {
        retStr += String.fromCharCode(data[i]);
      }
      return retStr;
    }
  },

  /**
   * @param {number} appState
   */
  _setMenuState(appState) {
    const iTraceMenu = atom.menu.template.find(item => {
      return item.label === 'iTrace Atom';
    });
    const menuItem_connect = iTraceMenu.submenu[0];
    const menuItem_disconnect = iTraceMenu.submenu[1];
    switch (appState) {
      case AppState.Connected:
        menuItem_connect.enabled = false;
        menuItem_disconnect.enabled = true;
        break;
      case AppState.Disconnected:
        menuItem_connect.enabled = true;
        menuItem_disconnect.enabled = false;
        break;
      case AppState.Stopped:
        break;
      case AppState.Started:
        break;
    }
    atom.menu.update();
  }
};
