#!/usr/bin/env node
/**
 * 디자인 토큰 우회 검사
 *
 * 왜 필요한가:
 * globals.css 에 글자 크기 스케일(text-3xs~text-base)과 브랜드 색(--color-brand…)을 정해 뒀는데,
 * 코드에서 text-[10px] 이나 bg-[#335f87] 처럼 임의 값을 쓰면 그 규칙을 조용히 건너뜁니다.
 * 실제로 그렇게 글자 크기 103곳과 브랜드 색 325곳이 흩어졌던 적이 있습니다.
 *
 *  - 임의 px 글자 크기는 rem 스케일과 달리 "큰 글씨 모드"에서 혼자 안 커집니다.
 *  - 손으로 적은 색은 시간이 지나며 값이 갈라집니다(같은 hover 에 #2b5072 와 #284b6b 가 공존했습니다).
 *
 * 실행: npm run check:tokens
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['src', 'app']

// 의도적으로 예외인 파일들. 이유를 함께 적어 두어 나중에 "왜 빠져 있지?"를 없앱니다.
const ALLOWED = [
  {
    path: 'src/components/admin/StatsTab.tsx',
    rule: 'text',
    why: '출석 통계 표가 글자를 키우면 칸이 밀려 잘립니다. 파일 상단 주석에 이유를 적어 뒀습니다.',
  },
  {
    path: 'app/demo/',
    rule: 'all',
    why: '실제 앱이 아니라 디자인 시안 페이지입니다.',
  },
]

const RULES = [
  {
    id: 'text',
    re: /text-\[\d+px\]/g,
    msg: '임의 px 글자 크기 — globals.css 의 스케일(text-3xs/2xs/xs/sm/base)을 쓰세요',
  },
  {
    id: 'color',
    re: /-\[#(?:335f87|2b5072|284b6b|1d3a54|2c5378|3f76a3|3d6d99|4f8fd1)\]/gi,
    msg: '브랜드 색 하드코딩 — bg-brand / text-brand / border-brand-hover 등을 쓰세요',
  },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

function isAllowed(file, ruleId) {
  const rel = relative('.', file).split('\\').join('/')
  return ALLOWED.some(a => rel.startsWith(a.path) && (a.rule === 'all' || a.rule === ruleId))
}

let problems = 0
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    for (const rule of RULES) {
      if (isAllowed(file, rule.id)) continue
      lines.forEach((line, i) => {
        for (const hit of line.matchAll(rule.re)) {
          const rel = relative('.', file).split('\\').join('/')
          console.error(`${rel}:${i + 1}  ${hit[0]}\n    → ${rule.msg}`)
          problems++
        }
      })
    }
  }
}

if (problems > 0) {
  console.error(`\n토큰을 건너뛴 곳 ${problems}군데를 찾았습니다.`)
  console.error('의도한 예외라면 scripts/check-design-tokens.mjs 의 ALLOWED 에 이유와 함께 적어 주세요.')
  process.exit(1)
}

console.log('디자인 토큰 검사 통과 — 임의 글자 크기·브랜드 색 하드코딩 없음')
