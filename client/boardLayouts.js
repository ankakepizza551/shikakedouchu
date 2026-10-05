// 盤面定義。サーバー (server/gameLogic.js) とクライアント (game.js) の両方から読み込む
const BOARD_LAYOUTS = {
  15: {
    maxNode: 15,
    nodes: [
      { id: '0', label: '始', row: 1, col: 0, type: 'common', next: ['1'] },
      { id: '1', label: '1', row: 1, col: 1, type: 'common', next: ['2'] },
      { id: '2', label: '2', row: 1, col: 2, type: 'common', next: ['3'] },
      { id: '3', label: '3', row: 1, col: 3, type: 'common', next: ['4'] },
      { id: '4', label: '4', row: 1, col: 4, type: 'common', next: ['5A', '5B', '5C'] },
      // Route A (桜 - 5 steps to 11)
      { id: '5A', label: '5上', row: 0, col: 4, type: 'route-a', next: ['6A'] },
      { id: '6A', label: '6上', row: 0, col: 5, type: 'route-a', next: ['7A'] },
      { id: '7A', label: '7上', row: 0, col: 6, type: 'route-a', next: ['8A'] },
      { id: '8A', label: '8上', row: 0, col: 7, type: 'route-a', next: ['9A'] },
      { id: '9A', label: '9上', row: 1, col: 8, type: 'route-a', next: ['11'] },
      // Route B (竹 - 5 steps to 11)
      { id: '5B', label: '5中', row: 1, col: 5, type: 'route-b', next: ['6B'] },
      { id: '6B', label: '6中', row: 1, col: 6, type: 'route-b', next: ['7B'] },
      { id: '7B', label: '7中', row: 1, col: 7, type: 'route-b', next: ['8B'] },
      { id: '8B', label: '8中', row: 2, col: 6, type: 'route-b', next: ['11'] },
      // Route C (藤 - 4 steps to 11)
      { id: '5C', label: '5下', row: 2, col: 4, type: 'route-c', next: ['6C'] },
      { id: '6C', label: '6下', row: 2, col: 5, type: 'route-c', next: ['7C'] },
      { id: '7C', label: '7下', row: 3, col: 6, type: 'route-c', next: ['11'] },
      // Common End
      { id: '11', label: '11', row: 2, col: 7, type: 'common', next: ['12'] },
      { id: '12', label: '12', row: 2, col: 8, type: 'common', next: ['13'] },
      { id: '13', label: '13', row: 3, col: 8, type: 'common', next: ['14'] },
      { id: '14', label: '14', row: 3, col: 7, type: 'common', next: ['15'] },
      { id: '15', label: '終', row: 3, col: 5, type: 'common', next: [] },
    ]
  },
  20: {
    maxNode: 20,
    nodes: [
      { id: '0', label: '始', row: 1, col: 0, type: 'common', next: ['1'] },
      { id: '1', label: '1', row: 1, col: 1, type: 'common', next: ['2'] },
      { id: '2', label: '2', row: 1, col: 2, type: 'common', next: ['3'] },
      { id: '3', label: '3', row: 1, col: 3, type: 'common', next: ['4'] },
      { id: '4', label: '4', row: 1, col: 4, type: 'common', next: ['5'] },
      { id: '5', label: '5', row: 1, col: 5, type: 'common', next: ['6A', '6B', '6C'] },
      // Route A (桜 - 8 steps to 13)
      { id: '6A', label: '6上', row: 0, col: 5, type: 'route-a', next: ['7A'] },
      { id: '7A', label: '7上', row: 0, col: 6, type: 'route-a', next: ['8A'] },
      { id: '8A', label: '8上', row: 0, col: 7, type: 'route-a', next: ['9A'] },
      { id: '9A', label: '9上', row: 0, col: 8, type: 'route-a', next: ['10A'] },
      { id: '10A', label: '10上', row: 0, col: 9, type: 'route-a', next: ['11A'] },
      { id: '11A', label: '11上', row: 0, col: 10, type: 'route-a', next: ['12A'] },
      { id: '12A', label: '12上', row: 1, col: 10, type: 'route-a', next: ['13'] },
      // Route B (竹 - 6 steps to 13)
      { id: '6B', label: '6中', row: 1, col: 6, type: 'route-b', next: ['7B'] },
      { id: '7B', label: '7中', row: 1, col: 7, type: 'route-b', next: ['8B'] },
      { id: '8B', label: '8中', row: 1, col: 8, type: 'route-b', next: ['9B'] },
      { id: '9B', label: '9中', row: 1, col: 9, type: 'route-b', next: ['10B'] },
      { id: '10B', label: '10中', row: 2, col: 8, type: 'route-b', next: ['13'] },
      // Route C (藤 - 5 steps to 13)
      { id: '6C', label: '6下', row: 2, col: 5, type: 'route-c', next: ['7C'] },
      { id: '7C', label: '7下', row: 2, col: 6, type: 'route-c', next: ['8C'] },
      { id: '8C', label: '8下', row: 2, col: 7, type: 'route-c', next: ['9C'] },
      { id: '9C', label: '9下', row: 3, col: 8, type: 'route-c', next: ['13'] },
      // Common End
      { id: '13', label: '13', row: 2, col: 9, type: 'common', next: ['14'] },
      { id: '14', label: '14', row: 2, col: 10, type: 'common', next: ['15'] },
      { id: '15', label: '15', row: 3, col: 10, type: 'common', next: ['16'] },
      { id: '16', label: '16', row: 4, col: 10, type: 'common', next: ['17'] },
      { id: '17', label: '17', row: 4, col: 9, type: 'common', next: ['18'] },
      { id: '18', label: '18', row: 4, col: 8, type: 'common', next: ['19'] },
      { id: '19', label: '19', row: 4, col: 7, type: 'common', next: ['20'] },
      { id: '20', label: '終', row: 3, col: 7, type: 'common', next: [] },
    ]
  },
  30: {
    maxNode: 30,
    nodes: [
      { id: '0', label: '始', row: 1, col: 0, type: 'common', next: ['1'] },
      { id: '1', label: '1', row: 1, col: 1, type: 'common', next: ['2'] },
      { id: '2', label: '2', row: 1, col: 2, type: 'common', next: ['3'] },
      { id: '3', label: '3', row: 1, col: 3, type: 'common', next: ['4'] },
      { id: '4', label: '4', row: 1, col: 4, type: 'common', next: ['5'] },
      { id: '5', label: '5', row: 1, col: 5, type: 'common', next: ['6'] },
      { id: '6', label: '6', row: 1, col: 6, type: 'common', next: ['7'] },
      { id: '7', label: '7', row: 1, col: 7, type: 'common', next: ['8A', '8B', '8C'] },
      // Route A (桜 - 11 steps to 18)
      { id: '8A', label: '8上', row: 0, col: 7, type: 'route-a', next: ['9A'] },
      { id: '9A', label: '9上', row: 0, col: 8, type: 'route-a', next: ['10A'] },
      { id: '10A', label: '10上', row: 0, col: 9, type: 'route-a', next: ['11A'] },
      { id: '11A', label: '11上', row: 0, col: 10, type: 'route-a', next: ['12A'] },
      { id: '12A', label: '12上', row: 0, col: 11, type: 'route-a', next: ['13A'] },
      { id: '13A', label: '13上', row: 1, col: 11, type: 'route-a', next: ['14A'] },
      { id: '14A', label: '14上', row: 2, col: 11, type: 'route-a', next: ['15A'] },
      { id: '15A', label: '15上', row: 3, col: 11, type: 'route-a', next: ['16A'] },
      { id: '16A', label: '16上', row: 4, col: 11, type: 'route-a', next: ['17A'] },
      { id: '17A', label: '17上', row: 4, col: 10, type: 'route-a', next: ['18'] },
      // Route B (竹 - 8 steps to 18)
      { id: '8B', label: '8中', row: 1, col: 8, type: 'route-b', next: ['9B'] },
      { id: '9B', label: '9中', row: 1, col: 9, type: 'route-b', next: ['10B'] },
      { id: '10B', label: '10中', row: 1, col: 10, type: 'route-b', next: ['11B'] },
      { id: '11B', label: '11中', row: 2, col: 10, type: 'route-b', next: ['12B'] },
      { id: '12B', label: '12中', row: 3, col: 10, type: 'route-b', next: ['13B'] },
      { id: '13B', label: '13中', row: 3, col: 9, type: 'route-b', next: ['14B'] },
      { id: '14B', label: '14中', row: 3, col: 8, type: 'route-b', next: ['18'] },
      // Route C (藤 - 6 steps to 18)
      { id: '8C', label: '8下', row: 2, col: 7, type: 'route-c', next: ['9C'] },
      { id: '9C', label: '9下', row: 2, col: 6, type: 'route-c', next: ['10C'] },
      { id: '10C', label: '10下', row: 3, col: 6, type: 'route-c', next: ['11C'] },
      { id: '11C', label: '11下', row: 4, col: 6, type: 'route-c', next: ['12C'] },
      { id: '12C', label: '12下', row: 4, col: 7, type: 'route-c', next: ['18'] },
      // Common End
      { id: '18', label: '18', row: 4, col: 8, type: 'common', next: ['19'] },
      { id: '19', label: '19', row: 4, col: 9, type: 'common', next: ['20'] },
      { id: '20', label: '20', row: 5, col: 9, type: 'common', next: ['21'] },
      { id: '21', label: '21', row: 5, col: 8, type: 'common', next: ['22'] },
      { id: '22', label: '22', row: 5, col: 7, type: 'common', next: ['23'] },
      { id: '23', label: '23', row: 5, col: 6, type: 'common', next: ['24'] },
      { id: '24', label: '24', row: 5, col: 5, type: 'common', next: ['25'] },
      { id: '25', label: '25', row: 5, col: 4, type: 'common', next: ['26'] },
      { id: '26', label: '26', row: 5, col: 3, type: 'common', next: ['27'] },
      { id: '27', label: '27', row: 5, col: 2, type: 'common', next: ['28'] },
      { id: '28', label: '28', row: 5, col: 1, type: 'common', next: ['29'] },
      { id: '29', label: '29', row: 5, col: 0, type: 'common', next: ['30'] },
      { id: '30', label: '終', row: 4, col: 0, type: 'common', next: [] },
    ]
  }
};

if (typeof module !== 'undefined') module.exports = { BOARD_LAYOUTS };
