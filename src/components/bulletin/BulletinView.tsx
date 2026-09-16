'use client'

import { BulletinContent } from '../../lib/bulletinContent'

/**
 * 주보 렌더러 — 웹 보기와 인쇄본을 **같은 코드**로 그립니다.
 *
 *   mode="web"    성도용. 1 → 2 → 3 → 4 쪽이 세로로 이어집니다.
 *   mode="print"  관리자용. A4 가로 2장, 앞면 [4|1] · 뒷면 [2|3].
 *                 반으로 접으면 A5 4쪽 주보가 됩니다.
 *
 * 한 벌의 마크업으로 두 순서를 만드는 방법:
 *   DOM 순서는 인쇄 순서(4,1,2,3) 그대로 두고, 웹에서는 .sheet 를
 *   display:contents 로 없애 네 쪽을 형제로 만든 뒤 CSS order 로 1,2,3,4 로 세웁니다.
 *   → 내용을 두 번 쓰지 않습니다.
 *
 * 디자인 원본은 public/bulletin.html 입니다. 그쪽을 고치면 여기도 같이 고쳐 주세요.
 *
 * ⚠️ 스타일 격리: 이 컴포넌트의 CSS 선택자는 전부 .bl-root 아래로 한정됩니다.
 *    앱의 Tailwind 와 섞이지 않게 하기 위함이니, 규칙을 추가할 때도 접두사를 지키세요.
 *    @page / @media print 만은 한정할 수 없어서 mode="print" 일 때만 내보냅니다.
 *    (홈 화면에 얹힌 채로 @page 가 살아 있으면 홈을 인쇄할 때 용지가 가로로 돌아갑니다.)
 */

interface BulletinViewProps {
  content: BulletinContent
  mode?: 'web' | 'print'
  /** 로고 파일 경로. 기본값은 public/ 의 홈페이지 로고입니다. */
  logoSrc?: string
}

export default function BulletinView({
  content,
  mode = 'web',
  logoSrc = '/logo-wide@2x.png',
}: BulletinViewProps) {
  const c = content

  // 설교 행은 다른 예배 순서와 똑같은 한 줄로 목록 맨 아래에 붙습니다.
  const preRows = [...c.orderPre, { item: c.sermon.label, by: c.sermon.by }]

  const orderRow = (o: { item: string; by: string }, key: string) => (
    <li key={key}>
      <span className="bul" />
      <span className="it">{o.item}</span>
      <span className="by">{o.by}</span>
    </li>
  )

  /** \n 을 <br> 로. dangerouslySetInnerHTML 을 쓰지 않으려고 조각으로 나눕니다. */
  const multiline = (s: string) =>
    s.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ))

  const foot = (page: number) => (
    <div className="foot">
      <span className="dot" />
      <span>{c.churchName}</span>
      <span className="pg">{page}</span>
    </div>
  )

  return (
    <div className={`bl-root bl-${mode}`}>
      <style>{mode === 'print' ? CSS + PRINT_CSS : CSS}</style>

      <div className="doc">
        {/* ══ 앞면 시트 : 4쪽 | 1쪽 ══ 배경색이 같고 위쪽 베이지 원이 접힘선에서 이어집니다 */}
        <section className="sheet">
          {/* ─── 4쪽 : 목회칼럼 · 섬김 · 공지 · 헌금 ─── */}
          <article className="page blue" style={{ ['--o' as string]: 4 }}>
            <div className="blob seam-t-l" />
            <div className="blob" style={{ width: '36mm', height: '36mm', background: '#fff', top: '98mm', left: '-14mm', opacity: 0.35 }} />

            <div className="message">
              <div className="dot" />
              <div className="caps">{c.messageLabel}</div>
              <h2 className="t">{multiline(c.messageTitle)}</h2>
              <div className="body">{multiline(c.messageBody)}</div>
            </div>

            <div style={{ marginTop: '5mm' }}>
              <div className="sec-title">{c.servingTitle}</div>
              <div className="tables">
                {c.servingMonths.map((m, mi) => (
                  <table key={mi}>
                    <thead>
                      <tr>{m.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {m.rows.map((r, ri) => (
                        <tr key={ri}>{r.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>

            <div className="notice">
              <h4>{c.noticeTitle}</h4>
              <ul>{c.notices.map((n, i) => <li key={i}>{multiline(n)}</li>)}</ul>
            </div>

            <div className="offering">
              <div className="txt">
                <div className="lab">{c.offeringLabel}</div>
                <div className="ln">
                  {c.offeringLines.map((l, i, arr) => (
                    <span key={i}>{l}{i < arr.length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
              <div className="qr">
                {c.offeringQr
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.offeringQr} alt="헌금 계좌 QR" />
                  : 'QR'}
              </div>
            </div>

            {foot(4)}
          </article>

          {/* ─── 1쪽 : 표지 ─── */}
          <article className="page blue cover" style={{ ['--o' as string]: 1 }}>
            <div className="blob seam-t-r" />
            <div className="blob" style={{ width: '62mm', height: '62mm', background: 'var(--light)', bottom: '-26mm', right: '-20mm', opacity: 0.6 }} />

            <div className="top">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo" src={logoSrc} alt="The Bridge Church Hanoi" />
            </div>

            <div className="datebar">
              <div className="d">{c.date}</div>
              <div className="s">{c.dateSub}</div>
            </div>

            <ul className="order">{preRows.map((o, i) => orderRow(o, `pre-${i}`))}</ul>

            <div className="sermon">
              <span className="t">{multiline(c.sermon.title)}</span>
              {c.sermon.sub && <span className="s">{c.sermon.sub}</span>}
            </div>

            <ul className="order">{c.orderPost.map((o, i) => orderRow(o, `post-${i}`))}</ul>

            {foot(1)}
          </article>
        </section>

        {/* ══ 뒷면 시트 : 2쪽 | 3쪽 ══ 아래쪽 파란 원이 접힘선에서 이어집니다 */}
        <section className="sheet">
          {/* ─── 2쪽 : 교회소식 · 교우소식 ─── */}
          <article className="page" style={{ ['--o' as string]: 2 }}>
            <div className="blob" style={{ width: '56mm', height: '56mm', background: 'var(--light)', top: '-22mm', left: '-16mm', opacity: 0.55 }} />
            <div className="blob seam-b-l" />

            <div><span className="pill">{c.churchNewsLabel}</span></div>
            <div>
              {c.churchNews.map((n, i) => (
                <div className="block" key={i}>
                  <h3>{n.title}</h3>
                  <p>{multiline(n.body)}</p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '8mm' }}><span className="pill soft">{c.memberNewsLabel}</span></div>
            <div className="newsbox">
              {c.memberNews.map((n, i) => (
                <div className="block" key={i}>
                  <h3>{n.title}</h3>
                  <p>{multiline(n.body)}</p>
                </div>
              ))}
            </div>

            {foot(2)}
          </article>

          {/* ─── 3쪽 : 성경말씀 · 묵상메모 ─── */}
          <article className="page" style={{ ['--o' as string]: 3 }}>
            <div className="blob" style={{ width: '60mm', height: '60mm', background: 'var(--beige)', top: '78mm', right: '-30mm', opacity: 0.7 }} />
            <div className="blob seam-b-r" />

            <div><span className="pill">{c.scriptureLabel}</span></div>

            <div className="refline"><span className="ref">{c.scriptureRef}</span></div>

            <ul className="verses">
              {c.verses.map((v, i) => (
                <li key={i}>
                  <span className="n">{v.n}</span>
                  <span className="t">{v.t}</span>
                </li>
              ))}
            </ul>

            {/* 성경 본문 길이에 따라 남는 공간을 아래 끝까지 자동으로 채웁니다 */}
            <div className="memo">
              <div className="lab">{c.memoLabel}</div>
              <div className="lines" />
            </div>

            {foot(3)}
          </article>
        </section>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   스타일 — 모든 선택자가 .bl-root 아래로 한정됩니다 (앱의 Tailwind 와 격리).
   색·치수는 public/bulletin.html 과 같은 값입니다.
   ═════════════════════════════════════════════════════════════════════════ */
const CSS = `
.bl-root{
  --navy:#1e3a5f;
  --mid:#5b83ad;
  --light:#c5d8e8;
  --pale:#e8f0f8;
  --sky:#dbe7f3;
  --cream:#f5f1e8;
  --beige:#e3d9c6;
  --beige-soft:#ece5d6;
  --ink:#24415f;
  --muted:#9aa7b4;
  --rulec:rgba(30,58,95,.16);
  --sans:"Pretendard Variable",Pretendard,"맑은 고딕","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;
  --pad:11mm;
  --footh:9mm;
  --seam-top:58mm;
  --seam-bot:46mm;
  font-family:var(--sans);
  color:var(--ink);
  word-break:keep-all;
  overflow-wrap:break-word;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
.bl-root *{box-sizing:border-box;margin:0;padding:0}

.bl-root .doc{display:flex;flex-direction:column;align-items:center;gap:22px}
.bl-root .sheet{display:contents}
.bl-root .page{
  order:var(--o);
  position:relative;width:148.5mm;height:210mm;overflow:hidden;
  background:var(--cream);
  padding:var(--pad) var(--pad) calc(var(--pad) + var(--footh));
  display:flex;flex-direction:column;
  box-shadow:0 6px 24px rgba(0,0,0,.18);
}
.bl-root .page.blue{background:var(--sky)}

.bl-root .blob{position:absolute;border-radius:50%;pointer-events:none}
.bl-root .seam-t-l{width:var(--seam-top);height:var(--seam-top);background:var(--beige);
  top:calc(var(--seam-top) / -2.4);right:calc(var(--seam-top) / -2)}
.bl-root .seam-t-r{width:var(--seam-top);height:var(--seam-top);background:var(--beige);
  top:calc(var(--seam-top) / -2.4);left:calc(var(--seam-top) / -2)}
.bl-root .seam-b-l{width:var(--seam-bot);height:var(--seam-bot);background:var(--light);
  bottom:calc(var(--seam-bot) / -2);right:calc(var(--seam-bot) / -2);opacity:.6}
.bl-root .seam-b-r{width:var(--seam-bot);height:var(--seam-bot);background:var(--light);
  bottom:calc(var(--seam-bot) / -2);left:calc(var(--seam-bot) / -2);opacity:.6}

.bl-root .page > *:not(.blob){position:relative;z-index:1}

.bl-root .pill{display:inline-block;background:var(--navy);color:var(--cream);
  font-size:12.5pt;font-weight:700;letter-spacing:.02em;padding:2.8mm 5.4mm;line-height:1}
.bl-root .pill.soft{background:var(--mid)}

.bl-root .caps{font-size:8pt;letter-spacing:.34em;color:var(--mid);text-transform:uppercase}

.bl-root .page > .foot{
  position:absolute;left:var(--pad);right:var(--pad);bottom:var(--pad);
  height:var(--footh);display:flex;align-items:flex-end;gap:2.6mm;
  font-size:7.5pt;letter-spacing:.26em;color:var(--mid);z-index:2;
}
.bl-root .foot .dot{width:2.6mm;height:2.6mm;border-radius:50%;background:var(--navy);
  flex:0 0 auto;transform:translateY(-.6mm)}
.bl-root .foot .pg{margin-left:auto;letter-spacing:.06em;font-weight:700;color:var(--navy);
  font-variant-numeric:tabular-nums}

/* 1쪽 · 표지 */
.bl-root .cover .top{display:flex;justify-content:center;padding-top:3mm}
.bl-root .cover .logo{width:64mm;height:auto;display:block;background:none}

.bl-root .datebar{margin-top:6mm;background:var(--navy);color:#fff;padding:3.4mm 5.4mm;
  display:flex;align-items:baseline;gap:5mm}
.bl-root .datebar .d{font-size:15pt;font-weight:700;letter-spacing:.01em;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.bl-root .datebar .s{font-size:10pt;color:var(--light);letter-spacing:.06em;
  margin-left:auto;text-align:right}

.bl-root .order{margin-top:5mm;display:flex;flex-direction:column}
.bl-root .order li{list-style:none;display:flex;align-items:center;gap:3.2mm;
  padding:2.1mm 0;border-bottom:.3mm solid var(--rulec);font-size:10pt}
.bl-root .order li:last-child{border-bottom:0}
.bl-root .order .bul{width:2.4mm;height:2.4mm;border-radius:50%;background:var(--mid);flex:0 0 auto}
.bl-root .order .it{font-weight:700;color:var(--navy);white-space:pre}
.bl-root .order .by{margin-left:auto;color:#44648a;font-size:9.4pt;text-align:right}

/* 설교 제목 : 설교 행은 다른 순서와 똑같이 목록에 들어가고, 여기엔 제목만 */
.bl-root .sermon{margin:4mm 0;background:var(--mid);color:#fff;
  padding:4.6mm 5mm;text-align:center}
.bl-root .sermon .t{display:block;font-size:13pt;font-weight:800;line-height:1.3;
  letter-spacing:-.01em}
.bl-root .sermon .s{display:block;margin-top:1.6mm;font-size:8.6pt;
  color:rgba(255,255,255,.8);letter-spacing:.03em}

/* 2쪽 · 소식 */
.bl-root .block{margin-top:5.2mm}
.bl-root .block h3{font-size:10.6pt;font-weight:800;color:var(--navy);letter-spacing:-.01em}
.bl-root .block p{margin-top:1.6mm;font-size:9.4pt;line-height:1.62;color:#41617f}
.bl-root .newsbox{margin-top:4mm;background:var(--pale);padding:5.4mm}
.bl-root .newsbox .block:first-child{margin-top:0}

/* 3쪽 · 성경말씀 */
.bl-root .refline{margin-top:5mm}
.bl-root .refline .ref{display:inline-block;font-size:10.4pt;font-weight:600;color:#fff;
  background:var(--mid);padding:1.8mm 4.4mm;letter-spacing:.02em}

.bl-root .verses{margin-top:4.5mm;display:flex;flex-direction:column;gap:1.6mm}
.bl-root .verses li{list-style:none;display:flex;gap:3.2mm;align-items:baseline}
.bl-root .verses .n{flex:0 0 auto;min-width:7.6mm;text-align:center;background:var(--navy);color:#fff;
  font-size:7.8pt;font-weight:700;border-radius:2mm;padding:1mm 1.6mm;
  font-variant-numeric:tabular-nums;transform:translateY(-.4mm)}
.bl-root .verses .t{font-size:9.4pt;line-height:1.6;color:#365071}

.bl-root .memo{margin-top:6mm;background:var(--beige-soft);padding:4.6mm 5.4mm 5mm;
  flex:1 1 auto;min-height:24mm;display:flex;flex-direction:column}
.bl-root .memo .lab{font-size:8.4pt;letter-spacing:.3em;color:#8a7f6a;flex:0 0 auto}
.bl-root .memo .lines{flex:1 1 auto;min-height:0;margin-top:2mm;
  --rule:9.6mm;
  background-image:repeating-linear-gradient(to bottom,
    transparent 0, transparent calc(var(--rule) - .3mm),
    rgba(138,127,106,.5) calc(var(--rule) - .3mm), rgba(138,127,106,.5) var(--rule))}

/* 4쪽 · 목회칼럼 · 섬김 · 공지 */
.bl-root .message{text-align:center}
.bl-root .message .dot{width:4.4mm;height:4.4mm;border-radius:50%;background:var(--navy);margin:0 auto}
.bl-root .message .caps{margin-top:2.6mm;letter-spacing:.42em}
.bl-root .message .t{margin-top:3.2mm;font-size:13.5pt;font-weight:800;color:var(--navy);
  line-height:1.35;letter-spacing:-.01em}
.bl-root .message .body{margin-top:4.5mm;font-size:9.4pt;line-height:1.72;color:#41617f;
  text-align:center;padding:0 2mm}

.bl-root .sec-title{display:flex;align-items:center;gap:2.6mm;font-size:11pt;font-weight:800;
  color:var(--navy)}
.bl-root .sec-title::before{content:"";width:2.8mm;height:2.8mm;background:var(--mid);
  transform:rotate(45deg);flex:0 0 auto}

.bl-root .tables{margin-top:3.4mm;display:flex;gap:4mm}
.bl-root .tables table{flex:1;min-width:0;border-collapse:collapse;table-layout:fixed}
.bl-root .tables th{background:var(--navy);color:#fff;font-size:8pt;font-weight:700;
  padding:1.9mm .6mm;letter-spacing:.02em}
.bl-root .tables th:first-child{width:11mm}
.bl-root .tables td{border:.3mm solid rgba(91,131,173,.45);background:rgba(255,255,255,.68);
  height:6.8mm;font-size:8pt;text-align:center;color:#365071;padding:.5mm}
.bl-root .tables td:first-child{font-weight:700;color:var(--navy);background:rgba(255,255,255,.38);
  font-size:7.6pt}

.bl-root .notice{margin-top:5mm;background:var(--beige);padding:4.6mm 5.4mm}
.bl-root .notice h4{font-size:10.4pt;font-weight:800;color:var(--navy)}
.bl-root .notice ul{margin-top:2.4mm;display:flex;flex-direction:column;gap:1.4mm}
.bl-root .notice li{list-style:none;font-size:9pt;line-height:1.55;color:#574e3d;
  padding-left:3.4mm;position:relative}
.bl-root .notice li::before{content:"·";position:absolute;left:.6mm;color:#8a7f6a;font-weight:700}

.bl-root .offering{margin-top:auto;padding-top:5mm;display:flex;align-items:flex-end;
  justify-content:flex-end;gap:4mm}
.bl-root .offering .txt{text-align:right}
.bl-root .offering .lab{font-size:10pt;font-weight:800;color:var(--navy)}
.bl-root .offering .ln{margin-top:1.8mm;font-size:8.8pt;color:#41617f;line-height:1.5;
  font-variant-numeric:tabular-nums}
.bl-root .offering .qr{width:19mm;height:19mm;flex:0 0 auto;border:.3mm solid var(--mid);
  background:#fff;display:flex;align-items:center;justify-content:center;
  font-size:7pt;letter-spacing:.2em;color:var(--muted);overflow:hidden}
.bl-root .offering .qr img{width:100%;height:100%;object-fit:contain}

/* 좁은 화면(폰)에서는 A5 실물 크기가 화면을 넘으므로 축소해서 보여 줍니다 */
@media screen and (max-width:640px){ .bl-root .doc{zoom:.62} }
@media screen and (min-width:641px) and (max-width:820px){ .bl-root .doc{zoom:.82} }
`

/* 인쇄 전용 — mode="print" 일 때만 문서에 들어갑니다 */
const PRINT_CSS = `
@page{size:A4 landscape;margin:0}
@media print{
  .bl-root .doc{display:block;gap:0;zoom:1}
  .bl-root .sheet{display:flex;flex-direction:row;width:297mm;height:210mm;
    break-after:page;page-break-after:always}
  .bl-root .sheet:last-child{break-after:auto;page-break-after:auto}
  .bl-root .page{order:0;box-shadow:none;width:148.5mm}
}
`
