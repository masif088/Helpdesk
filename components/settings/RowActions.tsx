'use client'

import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Tooltip } from 'antd'
import type { ReactNode } from 'react'

/** Compact Edit / Delete icon buttons for settings tables. */
export default function RowActions({
  onEdit,
  onDelete,
  deleteTitle = 'Delete this item?',
  deleteDescription,
  deleteDisabledReason,
  extra,
}: {
  onEdit?: () => void
  onDelete?: () => void | Promise<void>
  deleteTitle?: string
  deleteDescription?: ReactNode
  /** When set, delete is shown disabled with this tooltip */
  deleteDisabledReason?: string
  /** Extra buttons before Edit */
  extra?: ReactNode
}) {
  return (
    <span className="row-actions">
      {extra}
      {onEdit ? (
        <Tooltip title="Edit">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} aria-label="Edit" />
        </Tooltip>
      ) : null}
      {deleteDisabledReason ? (
        <Tooltip title={deleteDisabledReason}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled aria-label="Delete" />
        </Tooltip>
      ) : onDelete ? (
        <Popconfirm title={deleteTitle} description={deleteDescription} onConfirm={() => void onDelete()} okText="Delete" okButtonProps={{ danger: true }}>
          <Tooltip title="Delete">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" />
          </Tooltip>
        </Popconfirm>
      ) : null}
    </span>
  )
}
