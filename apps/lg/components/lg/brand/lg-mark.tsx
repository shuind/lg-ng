import type { SVGProps } from "react"

/**
 * LG Atelier 品牌标识。
 * 将字母 G 绘制成右侧开口的圆环（带内勾终端），字母 L 雅致地嵌套于环内左侧，
 * 圆角描边呼应应用的衬线气质。颜色继承 currentColor，可随主题/上下文变化。
 */
export function LgMark({
  strokeWidth = 1.6,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="LG Atelier"
      {...props}
    >
      {/* G —— 右侧开口的圆环 + 朝内的横向终端勾 */}
      <path d="M26.62 13.15 A11 11 0 1 0 26.62 18.85 L26.62 16 L18.6 16" />
      {/* L —— 嵌套在环内左侧 */}
      <path d="M12.8 9 L12.8 21.2 L20 21.2" />
    </svg>
  )
}
