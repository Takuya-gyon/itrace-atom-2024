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

import uuid from 'uuid';
import fs from 'fs';
import EditorHandler from './editor-handler';
import XmlWriter from './xml-writer';
import { Console } from 'console';

export default class LoggingSession {

  constructor(filepath, timestampString = Date.now(), session_id, highlightState) {
    this._editorHandler = new EditorHandler();
    this._baseFilepath = filepath;
    this.languageType = this._editorHandler.getLanguageType();
    this.font_size = this._editorHandler.getFontSize(),
    this.line_height = this._editorHandler.getLineHeight()
    this.startTime = 0;
    this.highlightState = highlightState; //0:オフ, 1:単語ハイライト

    const fileOutputBasePath =
      filepath +
      (filepath[filepath.length - 1] === '/' || filepath[filepath.length - 1] === '\\' ? '' : '\\');

    this._baseFilePathWithFolder = fileOutputBasePath;
    this._gazeFilePath = `${fileOutputBasePath}itrace_atom-${timestampString}.xml`;

    const sp = this._editorHandler.getScreenProperties();
    this._xmlwriter = new XmlWriter(
      this._gazeFilePath,
      sp.bounds.width * sp.scaleFactor,
      sp.bounds.height * sp.scaleFactor,
      timestampString,
      session_id
    );

    this._sessionActive = false;
  }

  logPoint(x, y, eventId, log_time_ms) {
    if (this._sessionActive) {
      //言語
      this.languageType = this._editorHandler.getLanguageType();
      //フォントサイズ
      this.font_size = this._editorHandler.getFontSize();
      //行高さ
      this.line_height = this._editorHandler.getLineHeight();

      //行・列
      var position = this._editorHandler.getLineColumn({ x, y });
      //if(position) console.log("生:", position.row, position.column);
      if(position == null) {
        position = {row: -100, column: -100}
      }

      //ファイル名
      filename = this._editorHandler.getFileName();

      //単語
      var word = this._editorHandler.getWordAtPosition(position)
      if(word && word !== ' ' && word !== '') {
        console.log(word.value, word.position.start, word.position.end)
      }
      else {
        console.log("none", -1, -1)
      }

      const gaze = {
        eventId: eventId,
        x: x,
        y: y,
        row: position.row,
        column: position.column,
        filename: filename,
        language: this.languageType, //cant change after init
        font_size: this.font_size, //cant change after init
        line_height: this.line_height, //cant change after init
        pluginTime: log_time_ms,
        word: word.value
      };

      console.log(position)
      
      this._editorHandler.findHighlightRange(position, this.highlightState)

      this.writeGaze(gaze);
    }
  }

  async writeGaze(gaze){
    this._xmlwriter.writeGaze(gaze);
  }

  startSession() {
    console.log('セッション開始');
    this._sessionActive = true;
  }

  endSession() {
    console.log('セッション終了');
    try {
      this._xmlwriter.endWriting();
      this._sessionActive = false;
      return this._baseFilepath;
    } catch (e) {
      console.log("セッションエラー");
      console.log(e);
      return '';
    }
  }

  getSessionActive() {
    return this._sessionActive;
  }
}
