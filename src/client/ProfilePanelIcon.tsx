/** 侧栏「助理档案」行的字形：官方个人化图标，由侧栏负责按钮、标签与选中态。 */

import type { ReactNode } from 'react'
import { IconPersonalizationOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 按侧栏要求的边长渲染图标。
 * @param props - 侧栏给出的图标面：边长与是否选中。
 * @returns 图标元素。
 */
export function ProfilePanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconPersonalizationOutlineRegular size={size} />
}
