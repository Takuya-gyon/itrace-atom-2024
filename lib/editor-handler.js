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
/* global atom, document */

const {remote} = require('electron');
const {screen} = remote;

/*
EditorHandler controls all functions relating to the Atom editor,
Including mapping X, Y coordinates to line, column, highlighting
words and getting any information from the Atom and Electon APIs.
*/

export default class EditorHandler {
  constructor() {
    this.workspace = atom.workspace;
    let textEditer = atom.workspace.getActiveTextEditor();
    this.editor = textEditer;
    this.grammar = textEditer.getGrammar();
    this.screen = screen;
    this.document = document;
    this.marker = this.editor.markScreenRange(this.editor.cursors[0].getCurrentWordBufferRange());
    this.editerElement = atom.views.getView(this.editor);
  }

  getScreenProperties() {
    return this.screen.getPrimaryDisplay();
  }

  getFileName() {
    return this.editor.buffer.file.getBaseName();
  }

  getFontSize() {
    return this.editor.doubleWidthCharWidth;
  }

  getLineHeight() {
    return this.editor.lineHeightInPixels;
  }

  getLanguageType() {
    return this.grammar.name;
  }

  /*
  Input: {x: Integer, y: Integer} - An x y coordinate
  Output: {row: Integer, column: Integer} - A data structure containing the row
  and column of the given point.
  */
  getLineColumn(point) {
    const { bounds } = this.screen.getPrimaryDisplay();
    const editorWorkingArea = this.screen.getPrimaryDisplay().workAreaSize;
    const overscan = {
      x: bounds.width - editorWorkingArea.width + 8,
      y: bounds.height - editorWorkingArea.height + 8
    };
    const currentElement = this.document.elementFromPoint(
      point.x - overscan.x,
      point.y - overscan.y
    );
    const offsetX = this.calculateOffsetX();
    const columnWidth = this.getColumnWidth();

    let row = null;
    let column = null;
    // console.log('Current Element:', currentElement);
    if (currentElement === null) {
      return undefined;
    }
    // whitespace
    if (currentElement.classList.contains('line')) {
      // console.log('whitespace: ', currentElement );
      row = parseInt(currentElement.getAttribute('data-screen-row'), 10);
      column = Math.floor((point.x - offsetX + this.editerElement.getScrollLeft()) / columnWidth);
    }

    // code element of some sort
    else if (currentElement.className.includes('syntax') || currentElement.className.includes('leading-whitespace')) {
      const line = currentElement.closest('.line');
      // console.log('Current Element:', currentElement);
      // console.log('line: ', line);
      row = parseInt(line.getAttribute('data-screen-row'), 10);
      column = Math.floor((point.x - offsetX + this.editerElement.getScrollLeft()) / columnWidth);
    }

    // probably looking outside window
    // todo: map all objects
    else {
      return undefined;
    }

    return { row, column };
  }

  /*
  Output: Integer - An integer that is the width in pixels of a column.
  */
  getColumnWidth() {
    return this.workspace.getActiveTextEditor().defaultCharWidth;
  }

  /*
  Output: Integer - Outputs the amout of pixels in the x column that need to be
  accounted for when calculating column number.
  */
  calculateOffsetX() {
    const dockOffset = this.workspace.getLeftDock().element.clientWidth;
    let gutterOffset = 0;

    // get all gutters width
    this.workspace.getActiveTextEditor().gutterContainer.gutters.forEach(gutter => {
      gutterOffset += gutter.element.clientWidth;
    });
    return dockOffset + gutterOffset;
  }

  getToken(position) {
    const bufferPos = this.editor.bufferPositionForScreenPosition(position);
    const token = this.editor.scopeDescriptorForBufferPosition(bufferPos);
    return token.scopes[1];
  }

  /*
  Input: {row: Integer, column: Integer} - A data structure containg a single
  point in the editor.
  Output: {value: String, range: {end: Point, start: Point}} - A data structure
  containg the word and the range of characters it is located at.
  */
  getWordAtPosition(position) {
    const editor = this.workspace.getActiveTextEditor(); //アクティブなテキストエディタ取得
    const range = editor.cursors[0].getCurrentWordBufferRange();
    const nonWordChars = [
      ' ',
      '~',
      '!',
      '@',
      '#',
      '$',
      '%',
      '^',
      '&',
      '*',
      '(',
      ')',
      '_',
      '-',
      '=',
      '+',
      '[',
      ']',
      '{',
      '}',
      '|',
      ';',
      '<',
      ',',
      '.',
      '>',
      '/',
      '?',
      ':',
      '`',
      '"',
      "'",
      '\\'
    ];

    // set range to given point
    range.end.column = position.column + 1;
    range.end.row = position.row;
    range.start.column = position.column;
    range.start.row = position.row;
    let text = editor.getTextInRange(range);
    if (nonWordChars.includes(text)) {
      if(text === ' '){
        return undefined;
      }
      else {
        return { value: text, position: range };
      }
    }
    // find end of word
    let i = 0;
    while (!nonWordChars.some(substring => text.includes(substring))) {
      range.end.column += 1;
      text = editor.getTextInRange(range);
      i += 1;
      if (i > 100) {
        range.end.column = position.column + 1;
        break;
      }
    }
    range.end.column -= 1;
    text = editor.getTextInRange(range);

    // find start of word
    i = 0;
    while (!nonWordChars.some(substring => text.includes(substring))) {
      range.start.column -= 1;
      if (range.start.column === -1) break;
      text = editor.getTextInRange(range);
      i += 1;
      if (i > 100) {
        range.start.column = position.column - 1;
        break;
      }
    }
    range.start.column += 1;
    text = editor.getTextInRange(range);
    return { value: text, position: range };
  }

  /*
  Input: gaze event, highlightState boolean
  Output: if highlight event is true highlight word at
  the X, Y coordinates.
  */
  findHighlightRange(position, highlightState) {
    if (position == null) { //行・列が未定義の場合、ハイライトしない
      this.highlightText(undefined, this.marker);
    } else if (highlightState === 1) { //単語ハイライト機能オンの場合
      const word = this.getWordAtPosition(position);
      if (word) this.highlightText(word.position, this.marker);
    } else if (highlightState === 2) { //メッシュハイライト機能オンの場合
      const editor = this.workspace.getActiveTextEditor(); //アクティブなテキストエディタ取得
      const range = editor.cursors[0].getCurrentWordBufferRange();
      range.end.column = position.column + 1;
      range.end.row = position.row;
      range.start.column = position.column;
      range.start.row = position.row;

      this.highlightText(range, this.marker);
    } else { //その他の場合、ハイライトしない
      this.highlightText(undefined, this.marker);
    }
  }

  /*
  Input {Range: Range, marker: marker}
  Given a range and marker this will highlight a range
  */
  highlightText(range, marker) {
    if (range) {
      this.marker.setScreenRange(range);
      this.editor.decorateMarker(marker, {
        type: 'highlight',
        class: 'highlight-text'
      });
    } else {
      this.marker.destroy();
      this.marker = this.editor.markScreenRange(this.editor.cursors[0].getCurrentWordBufferRange());
    }
  }
}
