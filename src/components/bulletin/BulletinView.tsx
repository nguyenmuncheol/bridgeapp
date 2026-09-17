'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { BulletinContent, BulletinOrderItem, MEMO_LABEL } from '../../lib/bulletinContent'

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
 * ⚠️ 폭 맞추기 (web 모드)
 *   한 쪽이 A5 실물 크기(148.5mm ≈ 561px)입니다. 이 앱은 max-w-lg(512px) 안에서
 *   도는 모바일형 화면이라, 데스크톱 브라우저로 보면 창은 넓은데 **담는 칸이 좁아**
 *   주보가 칸 밖으로 잘려 나갑니다. 예전에는 화면(viewport) 너비로 축소 여부를
 *   정했기 때문에, 창이 넓으면 축소가 걸리지 않아 관리자 미리보기가 잘려 보였습니다.
 *   → 이제 **담는 칸의 실제 너비**를 재서 그만큼 축소합니다. 어디에 넣어도 맞습니다.
 *
 * ⚠️ 스타일 격리: 이 컴포넌트의 CSS 선택자는 전부 .bl-root 아래로 한정됩니다.
 *    앱의 Tailwind 와 섞이지 않게 하기 위함이니, 규칙을 추가할 때도 접두사를 지키세요.
 *    @page / @media print 만은 한정할 수 없어서 mode="print" 일 때만 내보냅니다.
 *    (홈 화면에 얹힌 채로 @page 가 살아 있으면 홈을 인쇄할 때 용지가 가로로 돌아갑니다.)
 *
 * 디자인 원본은 public/bulletin.html 입니다. 그쪽을 고치면 여기도 같이 고쳐 주세요.
 */

interface BulletinViewProps {
  content: BulletinContent
  mode?: 'web' | 'print'
  /** 로고 파일 경로. 기본값은 public/ 의 홈페이지 로고입니다. */
  logoSrc?: string
}

/** A5 한 쪽의 너비(148.5mm)를 화면 픽셀로. 96dpi 기준 148.5 / 25.4 * 96 */
const PAGE_WIDTH_PX = 561

/**
 * memo 로 감싼 이유: 관리자 주보 탭이 글자 하나마다 새로 그리면 타이핑이 밀립니다.
 * content 가 그대로면 다시 그리지 않습니다(같은 객체일 때만 건너뜁니다).
 */
function BulletinView({
  content,
  mode = 'web',
  logoSrc = '/logo-wide@2x.png',
}: BulletinViewProps) {
  const c = content
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // 담는 칸의 너비를 재서 그만큼 축소합니다.
  //
  // web 뿐 아니라 print 모드에서도 **화면에서는** 축소해야 합니다. 인쇄 화면을
  // 폰으로 열면 한 쪽(561px)이 화면(≈390px)보다 넓어 잘려 보이기 때문입니다.
  // 실제 인쇄할 때는 PRINT_CSS 가 zoom 을 1 로 되돌립니다(!important — 인라인
  // 스타일보다 세게 걸어야 이깁니다).
  //
  // ResizeObserver 는 observe() 직후 현재 크기로 한 번 호출되므로, effect 본문에서
  // 직접 setState 하지 않아도 첫 값이 들어옵니다.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w <= 0) return
      const next = Math.min(1, Math.round((w / PAGE_WIDTH_PX) * 1000) / 1000)
      setScale(prev => (Math.abs(prev - next) < 0.002 ? prev : next))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** 예배 순서 한 줄. center 가 있으면 설교처럼 가운데를 크게 씁니다. */
  const orderRow = (o: BulletinOrderItem, key: string) => {
    const center = (o.center || '').trim()
    return (
      <li key={key} className={center ? 'has-center' : undefined}>
        <span className="bul" />
        <span className="it">{o.item}</span>
        {center && <span className="ctr">{multiline(center)}</span>}
        <span className="by">{o.by}</span>
      </li>
    )
  }

  /** \n 을 <br> 로. dangerouslySetInnerHTML 을 쓰지 않으려고 조각으로 나눕니다. */
  const multiline = (s: string) =>
    s.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ))

  /** 메시지(목회칼럼)에 실제로 쓸 내용이 있는지 */
  const hasMessage = Boolean(c.messageTitle.trim() || c.messageBody.trim())

  const foot = (page: number) => (
    <div className="foot">
      <span className="name">{c.churchName}</span>
      <span className="pg">{page}</span>
    </div>
  )

  return (
    <div className={`bl-root bl-${mode}`} ref={wrapRef}>
      <style>{mode === 'print' ? CSS + PRINT_CSS : CSS}</style>

      <div className="doc" style={{ zoom: scale }}>
        {/* ══ 앞면 시트 : 4쪽 | 1쪽 ══ 배경색이 같고 위쪽 베이지 원이 접힘선에서 이어집니다 */}
        <section className="sheet">
          {/* ─── 4쪽 : 목회칼럼 · 섬김 · 공지 · 헌금 ─── */}
          <article className="page blue" style={{ ['--o' as string]: 4 }}>
            <div className="blob seam-t-l" />
            <div className="blob" style={{ width: '36mm', height: '36mm', background: '#fff', top: '98mm', left: '-14mm', opacity: 0.35 }} />

            {/* 메시지가 비어 있으면 MESSAGE 머리글까지 빼고 다섯 줄 남짓한 빈 자리만
                둡니다. 머리글만 덩그러니 남는 것보다 낫고, 그만큼 아래 섬김표가 올라옵니다. */}
            {hasMessage ? (
              <div className="message">
                <div className="dot" />
                <div className="caps">{c.messageLabel}</div>
                <h2 className="t">{multiline(c.messageTitle)}</h2>
                <div className="body">{multiline(c.messageBody)}</div>
              </div>
            ) : (
              <div className="message-blank" />
            )}

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

            {/* 적을 공지가 없으면 빈 상자만 남으므로 칸 자체를 뺍니다 */}
            {c.notices.some(n => n.trim()) && (
              <div className="notice">
                {c.noticeTitle.trim() && <h4>{c.noticeTitle}</h4>}
                <ul>
                  {c.notices.filter(n => n.trim()).map((n, i) => <li key={i}>{multiline(n)}</li>)}
                </ul>
              </div>
            )}

            {/* 격자로 짭니다. 두 이름표(교회홈페이지·헌금 계좌)가 **같은 줄**에
                놓이게 하려고, 이름표 줄과 계좌 줄을 격자의 서로 다른 행에 두고
                QR 두 개가 그 두 행을 함께 덮게 했습니다. */}
            <div className="offering">
              {/* 교회 홈페이지 QR — 주소를 비우면 이 칸이 통째로 빠집니다. */}
              {c.homepageQr && (
                <>
                  <div className="qr site-qr">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.homepageQr}
                      alt="교회 홈페이지 QR"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                  <div className="cap">{c.homepageLabel}</div>
                </>
              )}
              <div className="lab">{c.offeringLabel}</div>
              <div className="ln">
                {c.offeringLines.map((l, i, arr) => (
                  <span key={i}>{l}{i < arr.length - 1 && <br />}</span>
                ))}
              </div>
              {/* QR 그림이 얹히면 뒤의 'QR' 글자를 덮습니다. 파일이 없어 못 불러오면
                  그림만 숨겨져 다시 'QR' 글자가 보입니다 (깨진 그림 아이콘 방지). */}
              <div className="qr off-qr">
                <span className="ph">QR</span>
                {c.offeringQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.offeringQr}
                    alt="헌금 계좌 QR"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                )}
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

            <ul className="order">
              {c.orderPre.map((o, i) => orderRow(o, `pre-${i}`))}

              {/* 설교 : 설교 | 설교 제목(가운데, 한 단계 굵고 크게) | 설교자 */}
              <li className="has-center">
                <span className="bul" />
                <span className="it">{c.sermon.label}</span>
                <span className="ctr">
                  {multiline(c.sermon.title)}
                  {c.sermon.sub && <span className="ctr-sub">{c.sermon.sub}</span>}
                </span>
                <span className="by">{c.sermon.by}</span>
              </li>

              {c.orderPost.map((o, i) => orderRow(o, `post-${i}`))}
            </ul>

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
            <div className="news-in">
              {c.churchNews.map((n, i) => (
                <div className="block" key={i}>
                  <h3>{n.title}</h3>
                  <p>{multiline(n.body)}</p>
                </div>
              ))}
            </div>

            {/* 교우소식은 남는 공간의 가운데에 — 내용 길이에 따라 자동으로 자리잡습니다 */}
            <div className="membernews">
              <div><span className="pill soft">{c.memberNewsLabel}</span></div>
              <div className="newsbox">
                {c.memberNews.map((n, i) => (
                  <div className="block" key={i}>
                    <h3>{n.title}</h3>
                    <p>{multiline(n.body)}</p>
                  </div>
                ))}
              </div>
            </div>

            {foot(2)}
          </article>

          {/* ─── 3쪽 : 성경말씀 · 설교메모 ─── */}
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
              <div className="lab">{MEMO_LABEL}</div>
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
  --footdrop:3.2mm;    /* 꼬릿말을 쪽 아래로 더 내리는 양 (한 줄 ≈ 7.5pt × 1.2) */
  --seam-top:58mm;
  --seam-bot:46mm;
  /* 담는 칸 너비를 그대로 따라가게 합니다.
     flex 아이템으로 놓일 때(예: <div class="flex justify-center">) 기본값이면
     내용 너비(한 쪽 561px)로 부풀어, 칸을 재려던 측정이 늘 561 을 돌려주고
     축소가 걸리지 않습니다. width:100% + min-width:0 으로 칸에 맞춥니다. */
  display:block;
  width:100%;
  min-width:0;
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

/* 교우소식은 교회소식이 끝난 뒤 남는 공간의 **가운데**에 놓입니다.
   위아래 margin 을 auto 로 두면 남는 공간이 반씩 나뉘어 자동으로 자리를 잡고,
   교회소식이 길어 남는 공간이 없으면 그대로 바로 아래에 붙습니다. */
.bl-root .membernews{margin-top:auto;margin-bottom:auto;padding:6mm 0}

.bl-root .page > .foot{
  position:absolute;left:var(--pad);right:var(--pad);
  bottom:calc(var(--pad) - var(--footdrop));
  height:var(--footh);display:flex;align-items:flex-end;
  font-size:7.5pt;letter-spacing:.26em;color:var(--mid);z-index:2;
}
/* 점을 mm 로 밀어 맞추지 마세요 — 두 번 실패했습니다.
   점은 flex 칸(=별도의 줄)에 있었고 글자는 자기 줄 안에 있어서, 두 줄의 아래끝만
   맞을 뿐 글자가 줄 안에서 어디에 앉는지(내림폭·줄간격)는 알 수 없었습니다.
   그래서 밀어 맞춘 값이 글꼴이 바뀌면 다시 어긋납니다.

   이제 점을 **글자와 같은 줄 안**에 inline-block 으로 넣습니다. 기본
   vertical-align:baseline 이면 점의 아래끝이 글자의 기준선에 딱 앉고, 지름
   1.9mm 가 7.5pt 의 대문자 높이와 같으므로 점의 위끝이 대문자 위끝과 만납니다.
   → 보정값이 필요 없고 글자 크기를 바꿔도 따라옵니다. */
.bl-root .foot .name::before{content:"";display:inline-block;
  width:1.9mm;height:1.9mm;border-radius:50%;background:var(--navy);
  margin-right:1.9mm}
.bl-root .foot .pg{margin-left:auto;letter-spacing:.06em;font-weight:700;color:var(--navy);
  font-variant-numeric:tabular-nums}

/* 1쪽 · 표지 */
/* 로고는 쪽 위쪽에 바짝 붙입니다 (3mm → 0.5mm, 반 줄 정도 위로) */
.bl-root .cover .top{display:flex;justify-content:center;padding-top:.5mm}
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

/* 설교 행 : 설교 | 제목(가운데) | 설교자 — 별도 박스 없이 목록 안에 들어갑니다 */
/* 가운데를 크게 쓰는 줄 : 이름 | 강조할 글(가운데) | 담당
   설교 제목과 성경봉독 본문이 이 모양을 함께 씁니다. 별도 박스는 두지 않습니다.

   🐛 예전에는 좌우 칸이 내용만큼만 넓어서, 이름과 담당자 글자 수에 따라 가운데
      글이 줄마다 다른 자리에 놓였습니다(설교와 성경봉독이 서로 어긋나 보임).
   → 좌우를 같은 고정폭(24mm)으로 잡습니다. 남는 가운데 칸이 줄마다 똑같아지므로
      강조 글이 늘 같은 자리, 그리고 지면의 한가운데에 옵니다. */
.bl-root .order li.has-center{padding:3mm 0}
.bl-root .order li.has-center .it{flex:0 0 20mm}
/* 오른쪽은 왼쪽보다 5.6mm 넓습니다 — 왼쪽에만 있는 점(2.4mm)과 그 뒤 간격(3.2mm)
   만큼을 더해 줘야 가운데 글이 지면의 진짜 한가운데에 옵니다. */
.bl-root .order li.has-center .by{flex:0 0 calc(20mm + 2.4mm + 3.2mm);margin-left:0}
.bl-root .order .ctr{flex:1 1 auto;min-width:0;text-align:center;padding:0 3mm;
  font-size:11.5pt;font-weight:800;color:var(--navy);line-height:1.25;letter-spacing:-.01em}
.bl-root .order .ctr-sub{display:block;margin-top:1.2mm;font-size:8.4pt;font-weight:600;
  color:var(--mid);letter-spacing:.02em}

/* 2쪽 · 소식 */
.bl-root .block{margin-top:5.2mm}
.bl-root .block h3{font-size:10.6pt;font-weight:800;color:var(--navy);letter-spacing:-.01em}
.bl-root .block p{margin-top:1.6mm;font-size:9.4pt;line-height:1.62;color:#41617f}
/* 제목 박스(교회소식·교우소식 라벨)는 쪽 여백에 딱 붙여 두고, 그 아래 **글만**
   5.4mm 들여씁니다. 교우소식은 상자 안쪽 여백이 그 역할을 하므로, 교회소식 쪽에만
   같은 값을 따로 줍니다(.news-in). 두 소식의 글이 같은 선에서 시작합니다. */
.bl-root .newsbox{margin-top:4mm;background:var(--pale);padding:5.4mm}
.bl-root .news-in{padding-left:5.4mm}
.bl-root .newsbox .block:first-child{margin-top:0}

/* 3쪽 · 성경말씀 */
/* 성경 위치(요한복음 3:1-12)는 박스 없이 진한 남색 글자로만 둡니다.
   위의 '성경말씀' 라벨까지 박스라 두 개가 겹쳐 답답해 보였습니다. */
.bl-root .refline{margin-top:4.5mm}
.bl-root .refline .ref{display:inline-block;font-size:11pt;font-weight:800;
  color:var(--navy);letter-spacing:.01em}

.bl-root .verses{margin-top:4.5mm;display:flex;flex-direction:column;gap:1.6mm}
/* 🐛 예전에는 align-items:baseline 이었습니다. 절이 두 줄이 되면 번호가 첫 줄
   글자의 기준선에 붙는데, 번호는 배경이 있는 네모라 한 줄짜리와 두 줄짜리가
   서로 다른 높이에 놓여 목록 전체가 어긋나 보였습니다.
   → 위쪽 정렬로 바꾸고, 번호를 첫 줄 글자 높이에 맞춰 살짝만 내립니다. */
.bl-root .verses li{list-style:none;display:flex;gap:3mm;align-items:flex-start}
.bl-root .verses .n{flex:0 0 auto;min-width:6.4mm;text-align:center;background:var(--navy);color:#fff;
  font-size:7pt;font-weight:700;line-height:1;border-radius:1.4mm;padding:.9mm 1.1mm;
  font-variant-numeric:tabular-nums;margin-top:.9mm}
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
/* 메시지가 비었을 때 두는 빈 자리 — 본문 9.4pt × 줄간격 1.72 ≈ 5.7mm 이므로
   다섯 줄이면 약 28mm 입니다. */
.bl-root .message-blank{height:28mm}
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
.bl-root .tables th:last-child{width:16mm}
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

/* 칸 넷: [홈페이지 QR][교회홈페이지][남는 폭 · 헌금 계좌][헌금 QR]
   줄 둘: 1줄 = 이름표, 2줄 = 계좌 번호.
   1fr 을 **윗줄**에 줘서 남는 높이를 위로 밀어냅니다. 그래야 이름표가 계좌
   바로 위에 붙고, QR 아래끝·글 아래끝이 한 줄로 맞습니다. */
.bl-root .offering{margin-top:auto;padding-top:5mm;display:grid;
  grid-template-columns:auto auto 1fr auto;grid-template-rows:1fr auto;
  align-items:end;column-gap:2mm}
.bl-root .offering .site-qr{grid-column:1;grid-row:1 / span 2}
.bl-root .offering .cap{grid-column:2;grid-row:1}
.bl-root .offering .lab{grid-column:3;grid-row:1;text-align:right}
.bl-root .offering .ln{grid-column:3;grid-row:2;text-align:right;
  margin-top:1.8mm;font-size:8.8pt;color:#41617f;line-height:1.5;
  font-variant-numeric:tabular-nums}
.bl-root .offering .off-qr{grid-column:4;grid-row:1 / span 2;margin-left:2mm}
/* 두 이름표는 같은 글씨(10pt·굵게·남색)로, 같은 줄에 놓입니다 */
.bl-root .offering .lab,
.bl-root .offering .cap{font-size:10pt;font-weight:800;color:var(--navy);
  white-space:nowrap}
.bl-root .offering .qr{position:relative;width:22mm;height:22mm;
  border:.3mm solid var(--mid);background:#fff;display:flex;align-items:center;
  justify-content:center;overflow:hidden}
.bl-root .offering .qr .ph{font-size:7pt;letter-spacing:.2em;color:var(--muted)}
.bl-root .offering .qr img{position:absolute;inset:0;width:100%;height:100%;
  object-fit:contain;background:#fff}
`

/* 인쇄 전용 — mode="print" 일 때만 문서에 들어갑니다 */
const PRINT_CSS = `
@page{size:A4 landscape;margin:0}
@media print{
  /* 화면용 축소(인라인 style)를 이깁니다 — 종이에는 실물 크기로 나가야 합니다 */
  .bl-root .doc{display:block;gap:0;zoom:1 !important}
  .bl-root .sheet{display:flex;flex-direction:row;width:297mm;height:210mm;
    break-after:page;page-break-after:always}
  .bl-root .sheet:last-child{break-after:auto;page-break-after:auto}
  .bl-root .page{order:0;box-shadow:none;width:148.5mm}
}
`

export default memo(BulletinView)
