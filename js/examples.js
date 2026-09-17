/* examples.js — 内置示例工程
 * 结构与「执行」输出的 JSON 完全一致（program 用 next 串联，body/else 用数组，
 * 条件/运算/值内联在 inputs 中并带 returns），可直接被 engine.js 还原、被引擎解析。
 */
(function (root) {
  'use strict';
  var GP = (root.GP = root.GP || {});

  GP.EXAMPLES = {
    default: {
      name: '电击器脉冲',
      spec: {
        version: '1.0',
        program: [
          {
            opcode: 'when_start',
            id: 'blk_42',
            next: {
              opcode: 'repeat_forever',
              id: 'blk_54',
              body: [
                {
                  opcode: 'wait_seconds',
                  id: 'blk_43',
                  inputs: { N: 1, UNIT: '秒' }
                },
                {
                  opcode: 'if_then_else',
                  id: 'blk_44',
                  inputs: {
                    COND: {
                      opcode: 'cmp_gt',
                      id: 'blk_51',
                      inputs: {
                        A: { opcode: 'tens_omega', id: 'blk_52', inputs: { ID: 1 }, returns: 'number' },
                        B: 10
                      },
                      returns: 'boolean'
                    }
                  },
                  body: [
                    {
                      opcode: 'vibe_a_intensity',
                      id: 'blk_55',
                      inputs: { ID: 1, N: 0 }
                    },
                    {
                      opcode: 'repeat_times',
                      id: 'blk_45',
                      inputs: { N: 10 },
                      body: [
                        { opcode: 'tens_channel_set', id: 'blk_46', inputs: { ID: 1, CH: 'A', N: 30 } },
                        { opcode: 'wait_seconds', id: 'blk_47', inputs: { N: 10, UNIT: '秒' } },
                        { opcode: 'tens_channel_set', id: 'blk_49', inputs: { ID: 1, CH: 'A', N: 0 } },
                        { opcode: 'wait_seconds', id: 'blk_50', inputs: { N: 10, UNIT: '秒' } }
                      ]
                    }
                  ],
                  else: [
                    {
                      opcode: 'vibe_a_intensity',
                      id: 'blk_53',
                      inputs: { ID: 1, N: 50 }
                    }
                  ]
                }
              ]
            }
          }
        ],
        variables: {}
      }
    }
  };

  GP.getExample = function () { return GP.EXAMPLES.default; };
})(typeof window !== 'undefined' ? window : globalThis);
