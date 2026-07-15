import { ChevronDown } from '@/icons'
import { SongMetadata } from '@/types'
import { formatTime } from '@/utils'
import clsx from 'clsx'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { useCollator, useFilter } from 'react-aria'
import { Cell, Column, Table as RacTable, Row, TableBody, TableHeader } from 'react-aria-components'

type SongsTableProps = {
  rows: SongMetadata[]
  search: string
  onSelectRow: (id: string) => void
}

type SortState = {
  column: 'title' | 'duration'
  direction: 'ascending' | 'descending'
}

export default function Table({ rows, search, onSelectRow }: SongsTableProps) {
  const { contains } = useFilter({ sensitivity: 'base' })
  const collator = useCollator({ numeric: true, sensitivity: 'base' })
  const [sortDescriptor, setSortDescriptor] = useState<SortState>({
    column: 'duration',
    direction: 'ascending',
  })

  const filtered = useMemo(() => {
    if (!search) return rows
    return rows.filter((row) => contains(row.title, search))
  }, [contains, rows, search])

  const sorted = useMemo(() => {
    const next = [...filtered]
    const { column, direction } = sortDescriptor
    next.sort((a, b) => {
      let cmp = 0
      if (column === 'duration') {
        cmp = a.duration - b.duration
        if (cmp === 0) {
          cmp = collator.compare(a.title, b.title)
        }
      } else {
        cmp = collator.compare(a.title, b.title)
      }
      return direction === 'descending' ? -cmp : cmp
    })
    return next
  }, [collator, filtered, sortDescriptor])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
      style={{
        ['--sort-icon-gap' as any]: '1.5rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <RacTable
          aria-label="Songs"
          className="flex h-full w-full flex-col text-sm"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) =>
            setSortDescriptor({
              column: descriptor.column as SortState['column'],
              direction: descriptor.direction as SortState['direction'],
            })
          }
        >
          <TableHeader className="table w-full table-fixed bg-white/5 outline-hidden">
            <Column
              id="title"
              isRowHeader
              allowsSorting
              className="cursor-pointer border-b border-white/10 px-4 py-2 text-left text-sm font-semibold tracking-wider text-gray-400 uppercase outline-hidden"
            >
              {({ sortDirection }) => (
                <div className="relative flex items-center">
                  <span className="truncate pr-[var(--sort-icon-gap)]">Title</span>
                  <span className="absolute right-0 flex h-4 w-4 items-center justify-center">
                    {sortDirection && (
                      <ChevronDown
                        className={clsx('h-4 w-4', sortDirection === 'descending' && 'rotate-180')}
                      />
                    )}
                  </span>
                </div>
              )}
            </Column>
            <Column
              id="duration"
              allowsSorting
              className="w-30 cursor-pointer border-b border-white/10 px-4 py-2 text-right text-sm font-semibold tracking-wider text-gray-400 uppercase outline-hidden"
            >
              {({ sortDirection }) => (
                <div className="relative flex items-center justify-end">
                  <span className="truncate pr-[var(--sort-icon-gap)] text-right">Length</span>
                  <span className="absolute right-0 flex h-4 w-4 items-center justify-center">
                    {sortDirection && (
                      <ChevronDown
                        className={clsx('h-4 w-4', sortDirection === 'descending' && 'rotate-180')}
                      />
                    )}
                  </span>
                </div>
              )}
            </Column>
          </TableHeader>
          <TableBody
            className="block flex-1 overflow-y-auto"
            items={sorted}
            renderEmptyState={() => <div className="p-5 text-2xl text-gray-500">No results</div>}
          >
            {(item) => (
              <Row
                id={item.id}
                className="table w-full table-fixed cursor-pointer text-gray-200 outline-hidden hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-hidden"
                onAction={() => onSelectRow(item.id)}
              >
                <Cell className="truncate border-b border-white/5 px-4 py-2 text-gray-200 outline-hidden">
                  {item.title}
                </Cell>
                <Cell
                  className="border-b border-white/5 px-4 py-2 text-right text-gray-400 outline-hidden"
                  style={{ paddingRight: 'calc(1rem + var(--sort-icon-gap))' }}
                >
                  {formatTime(Number(item.duration))}
                </Cell>
              </Row>
            )}
          </TableBody>
        </RacTable>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-500">
        <span>Showing {sorted.length} songs</span>
      </div>
    </div>
  )
}

export function TableSkeleton() {
  const rows = Array.from({ length: 8 })
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="table w-full table-fixed bg-white/5">
          <div className="table-row">
            <div className="table-cell border-b border-white/10 px-4 py-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">
              Title
            </div>
            <div className="table-cell border-b border-white/10 px-4 py-2 text-right text-sm font-semibold tracking-wider text-gray-400 uppercase">
              Length
            </div>
          </div>
        </div>
        <div className="block flex-1 overflow-y-auto">
          {rows.map((_, index) => (
            <div key={index} className="table w-full table-fixed">
              <div className="table-row" style={{ height: '36.5px' }}>
                <div className="table-cell border-b border-white/5 px-4 py-2 align-middle">
                  <div className="shimmer h-4 w-[65%] rounded bg-white/10" />
                </div>
                <div className="table-cell border-b border-white/5 px-4 py-2 text-right align-middle">
                  <div className="shimmer ml-auto h-4 w-12 rounded bg-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-500">
        <span className="shimmer h-3 w-24 rounded bg-white/10" />
      </div>
    </div>
  )
}
