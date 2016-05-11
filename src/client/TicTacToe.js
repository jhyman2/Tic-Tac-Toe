import { Component } from 'react';
import io from 'socket.io-client';
import React from 'react';
import ReactDOM from 'react-dom';

const NUM_ROWS = 3;

/**
 * The main tic tac toe game resides here. Changes to the game specifically should be made in this component.
 */
class TicTacTow extends Component {

  constructor () {
    const gameMap = new Map();
    super();

    /**
     * initializing socket, gameMap, and setting state
     */
    this.socket = io();
    this.clearGameMap(gameMap);
    this.state = {
      me: '',
      gameMap,
      instructions: 'Waiting for opponent....',
      gameReady: false,
      myTurn: false,
      gameOver: false,
      myWins: 0,
      myLosses: 0,
      ties: 0
    };

    /**
     * Socket events
     */

     // The opponent has moved
    this.socket.on('opponent moved', (data) => {
      let gameMap = this.state.gameMap.set(data.position, data.player);
      this.setState({ gameMap });
    });

    // It is users turn
    this.socket.on('your turn', () => {
      this.setState({
        instructions: 'It\'s your turn',
        myTurn: true,
        gameOver: false
      });
    });

    // Opponent's turn
    this.socket.on('not your turn', () => {
      this.setState({
        instructions: 'Waiting for opponent to move....',
        myTurn: false,
        gameOver: false
      });
    });

    // Game ended in a tie
    this.socket.on('tie', (ties) => {
      this.setState({
        instructions: `Cat's game. Tie.`,
        myTurn: false,
        gameOver: true,
        ties
      });
    });

    // You are a spectator and have been given the gameMap state by the server
    this.socket.on('spectating', (gameMap) => {
      this.setState({
        gameMap,
        instructions: 'You are spectating',
        myTurn: false,
        gameOver: false
      });
    });

    // The game has ended in a win or a loss
    this.socket.on('somebody won', (player, XWins, OWins, ties) => {
      if (player === this.state.me) {
        this.setState({
          gameMap: this.state.gameMap,
          instructions: 'You won!',
          myTurn: false,
          gameOver: true,
          myWins: this.state.me === 'X' ? XWins : OWins,
          myLosses: this.state.me === 'O' ? XWins : OWins,
          ties
        });
      } else if (this.state.me === 'X' || this.state.me === 'O') {
        this.setState({
          gameMap: this.state.gameMap,
          instructions: 'You lost!',
          myTurn: false,
          gameOver: true,
          myWins: this.state.me === 'X' ? XWins : OWins,
          myLosses: this.state.me === 'O' ? XWins : OWins,
          ties
        });
      } else {
        this.setState({
          instructions: `${player} won`
        });
      }
    });

    // Player assignment received
    this.socket.on('you are', (player) => {
      this.setState({
        me: player,
        gameMap: this.state.gameMap,
        instructions: this.state.instructions,
        myTurn: this.state.myTurn,
        gameOver: this.state.gameOver
      });
    });

    // Opponent has quit
    this.socket.on('quitter', () => {
      const gameMap = this.clearGameMap(this.state.gameMap);

      this.setState({
        me: this.state.me,
        gameMap,
        instructions: this.state.me === 'X' ? 'Player O has quit!' : 'Player X has quit!',
        myTurn: false,
        gameOver: true
      });
    });

    // Server has sent its current gameMap state
    this.socket.on('gameMap', (gameMap) => {
      const newGameMap = new Map();

      for (let i = 1; i < 10; i++) {
        if (gameMap[i - 1]) {
          newGameMap.set(i - 1, gameMap[i - 1]);
        } else {
          newGameMap.set(i - 1, false);
        }
      }

      this.setState({ gameMap: newGameMap });
    });

    // Starting new game after just finishing one
    this.socket.on('new game', () => {
      const newGameMap = new Map();
      this.clearGameMap(newGameMap);

      this.setState({
        me: this.state.me,
        gameMap: newGameMap,
        instructions: this.state.me === 'X' ? 'New game, your turn!' : 'New game, opponent\'s turn',
        myTurn: this.state.me === 'X' ? true : false,
        gameOver: false
      });
    });

    this.socket.on('error', (err) => {
      this.setState({
        instructions: 'Lost connection to the server',
        myTurn: false
      });
    });
  }

  /**
   * clears the game map to an empty board
   * @param  {Map} gameMap is the state object of the game
   * @return {Map}         the modified map
   */
  clearGameMap (gameMap) {
    for (let i = 1; i < 10; i++) {
      gameMap.set(i, false);
    }

    return gameMap;
  }

  /**
   * handles the clicking of the board and updates all data
   * @param  {integer} position is the location on the board (1-9) of the click
   * @return {no return}
   */
  boardClick (position) {
    let instructions, gameOver;

    if (this.state.gameMap.get(position) || !this.state.myTurn || this.state.gameOver) {
      if (this.state.me.includes('Spectator')) {
        instructions = 'Spectators can\'t play';
      } else if (this.state.gameOver) {
        instructions = 'The game is over!';
        gameOver = true;
      } else if (!this.state.myTurn) {
        instructions = 'It is not your turn yet.';
        gameOver = false;
      } else {
        instructions = 'Choose another spot.';
        gameOver = false;
      }
      this.setState({
        me: this.state.me,
        gameMap: this.state.gameMap,
        instructions: instructions,
        myTurn: this.state.myTurn,
        gameOver
      });
    } else {
      this.setState({
        me: this.state.me,
        gameMap: this.state.gameMap,
        instructions: 'Waiting for opponent....',
        myTurn: this.state.myTurn
      });
      this.socket.emit('move', position);
    }
  }

  /**
   * assigns classes to the space
   *  - all spaces get 'ticSpace'
   *  - if player owns space, the space gets the 'mySpace' class
   *  - if opponent owns space, the space gets the 'taken' class
   * @param  {integer} position is the location on the board (1-9) of the click
   * @return {string} the classes as one string
   */
  getSpaceState (position) {
    let spaceClass = 'ticSpace';

    if (this.state.gameMap.get(position) === this.state.me) {
      spaceClass = `${spaceClass} mySpace`;
    }

    if (this.state.gameMap.get(position)) {
      spaceClass = `${spaceClass} taken`;
    }

    return spaceClass;
  }

  // tells server that the user wants to play again
  playAgain () {
    this.socket.emit('play again');
  }

  /**
   * Builds a row across the tic tac toe board
   * @param  {integer} i represents the current row index (0 - 2)
   * @return {JSX}
   */
  buildRow (i) {
    let spaces = [];

    for (let j = 1; j < NUM_ROWS + 1; j++) {
      let space = (i * NUM_ROWS) + j;

      spaces.push(
        <div id={`space${space}`} className={this.getSpaceState(space)} onClick={this.boardClick.bind(this, space)} key={space}>
          <span>
            {!this.state.gameMap.get(space) ? '' : this.state.gameMap.get(space)}
          </span>
        </div>
      );
    }

    return spaces;
  }

  /**
   * Builds the entire tic tac toe grid
   * @return {}
   */
  buildGrid () {
    let rows = [];

    for (let i = 0; i < NUM_ROWS; i++) {
      rows.push(
        <div id={`row${i + 1}`} className="ticTacRow" key={`row${i+1}`}>
          {this.buildRow(i)}
        </div>
      )
    }

    return rows;
  }

  render () {
    return (
      <div id="wrapper">
        <h4 id="whoAmI">Me: {this.state.me}</h4>
        <div id="gameHolder">
          {this.buildGrid()}
        </div>
        <h3>{this.state.instructions}</h3>
        {(this.state.me === 'X' || this.state.me === 'O') &&
          <div id="scoreBoard">
            <span><b>Wins:</b> {this.state.myWins}</span>
            <span><b>Losses:</b> {this.state.myLosses}</span>
            <span><b>Ties:</b> {this.state.ties}</span>
          </div>
        }
        {this.state.gameOver &&
          <div id="buttonHolder">
            <button id="playAgainBtn" onClick={this.playAgain.bind(this)}>Play again?</button>
          </div>
        }
      </div>
    );
  }
}

export default TicTacTow;