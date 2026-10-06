runs: valtio=3/3 mobx=3/3 mobx-state-tree=3/3 mobx-keystone=3/3 legend-state=3/3 redux=3/3 zustand=3/3 jotai=3/3 effector-nested=3/3 effector-model=3/3

### add 50 groups through the buttons (ms, in page)
| app | click loop (sync) | until 51 group headers in DOM | until painted (2 rAF) | React commits |
|---|---:|---:|---:|---:|
| valtio | 12.1 | 52.2 | 58.0 | 1.0 |
| mobx | 697.3 | 698.3 | 702.9 | 1.0 |
| mobx-state-tree | 821.2 | 822.3 | 827.0 | 1.0 |
| mobx-keystone | 711.5 | 712.6 | 717.0 | 1.0 |
| legend-state | 512.4 | 513.7 | 518.3 | 1.0 |
| redux | 467.5 | 468.6 | 472.9 | 1.0 |
| zustand | 450.9 | 451.9 | 456.0 | 1.0 |
| jotai | 474.5 | 475.6 | 480.0 | 1.0 |
| effector-nested | 436.9 | 440.6 | 446.3 | 2.0 |
| effector-model | 468.7 | 472.4 | 477.2 | 2.0 |

### edit latency, Enter -> first DOM change of the watched cell (ms, median of 5), 68 products
| app | local edit (own cell) | synced: deal cell | synced: product col 5 | broadcast: product col 1 | broadcast: product col 6 |
|---|---:|---:|---:|---:|---:|
| valtio | 0.9 | 24.3 | 24.3 | 19.2 | 19.2 |
| mobx | 1.7 | 33.3 | 33.3 | 33.6 | 33.6 |
| mobx-state-tree | 1.2 | 53.0 | 53.0 | 50.5 | 50.5 |
| mobx-keystone | 1.2 | 37.2 | 37.2 | 41.4 | 41.4 |
| legend-state | 1.2 | 9.4 | 9.4 | 8.4 | 8.4 |
| redux | 1.2 | 7.8 | 7.8 | 8.8 | 8.8 |
| zustand | 0.9 | 5.7 | 5.7 | 5.7 | 5.7 |
| jotai | 1.0 | 8.3 | 8.3 | 8.8 | 8.8 |
| effector-nested | 1.0 | 5.7 | 5.7 | 5.5 | 5.5 |
| effector-model | 1.3 | 9.6 | 9.6 | 8.9 | 8.9 |

### React commits in the 300 ms after an edit (median)
| app | local | synced | broadcast | paste |
|---|---:|---:|---:|---:|
| valtio | 1.0 | 1.0 | 1.0 | 1.0 |
| mobx | 1.0 | 1.0 | 1.0 | 1.0 |
| mobx-state-tree | 1.0 | 1.0 | 1.0 | 1.0 |
| mobx-keystone | 1.0 | 1.0 | 1.0 | 1.0 |
| legend-state | 1.0 | 1.0 | 1.0 | 1.0 |
| redux | 1.0 | 1.0 | 1.0 | 1.0 |
| zustand | 1.0 | 1.0 | 1.0 | 1.0 |
| jotai | 1.0 | 1.0 | 1.0 | 1.0 |
| effector-nested | 1.0 | 1.0 | 1.0 | 1.0 |
| effector-model | 1.0 | 1.0 | 1.0 | 1.0 |

### paste 16 rows x 68 product columns (ms, in page)
| app | handler (store write incl.) | until painted | status |
|---|---:|---:|---:|
| valtio | 62.9 | 88.7 | Pasted 952 cells, skipped 136 |
| mobx | 59.4 | 94.6 | Pasted 952 cells, skipped 136 |
| mobx-state-tree | 78.3 | 134.3 | Pasted 952 cells, skipped 136 |
| mobx-keystone | 63.0 | 103.2 | Pasted 952 cells, skipped 136 |
| legend-state | 40.7 | 52.1 | Pasted 952 cells, skipped 136 |
| redux | 33.3 | 44.9 | Pasted 952 cells, skipped 136 |
| zustand | 21.5 | 30.7 | Pasted 952 cells, skipped 136 |
| jotai | 24.4 | 41.9 | Pasted 952 cells, skipped 136 |
| effector-nested | 21.5 | 42.3 | Pasted 952 cells, skipped 136 |
| effector-model | 24.8 | 39.6 | Pasted 952 cells, skipped 136 |

### tabs (D1)
| app | switch back to the 51-group deal: until DOM (ms) | until painted (ms) | spot ticks while hidden | expected at 500 ms |
|---|---:|---:|---:|---:|
| valtio | 70.1 | 77.3 | 8.0 | 8.0 |
| mobx | 115.2 | 124.7 | 8.0 | 8.0 |
| mobx-state-tree | 169.1 | 181.0 | 8.0 | 8.0 |
| mobx-keystone | 126.3 | 138.8 | 8.0 | 8.0 |
| legend-state | 48.4 | 56.8 | 8.0 | 8.0 |
| redux | 45.3 | 56.8 | 8.0 | 8.0 |
| zustand | 44.9 | 58.2 | 8.0 | 8.0 |
| jotai | 50.2 | 57.7 | 8.0 | 8.0 |
| effector-nested | 40.3 | 58.5 | 8.0 | 8.0 |
| effector-model | 41.0 | 51.9 | 8.0 | 8.0 |

### browser JS heap
| app | initial (KB) | growth per add/clone/remove cycle (KB, after GC) | first/last sample (KB) |
|---|---:|---:|---:|
| valtio | 11309.3 | 32.7 | 12606 / 15896 |
| mobx | 11755.5 | 29.5 | 12905 / 15996 |
| mobx-state-tree | 12577.0 | 31.2 | 13929 / 17051 |
| mobx-keystone | 15444.4 | 29.4 | 16856 / 19812 |
| legend-state | 11666.8 | 192.3 | 14614 / 33871 |
| redux | 11705.5 | 27.9 | 12843 / 15662 |
| zustand | 11044.9 | 26.8 | 12087 / 14775 |
| jotai | 11452.6 | 27.7 | 12525 / 15318 |
| effector-nested | 12090.2 | 26.9 | 13229 / 15950 |
| effector-model | 13017.1 | 29.2 | 14270 / 17189 |

### which components re-rendered in the commit(s) after a local edit
| app | components |
|---|---:|
| valtio | {"_c":1,"DealHeader":1} |
| mobx | {"_c":1,"DealHeader":1} |
| mobx-state-tree | {"_c":1,"DealHeader":1} |
| mobx-keystone | {"_c":1,"DealHeader":1} |
| legend-state | {"_c":1,"DealHeader":1} |
| redux | {"_c":1,"DealHeader":1} |
| zustand | {"_c":1,"DealHeader":1} |
| jotai | {"_c":1,"DealHeader":1} |
| effector-nested | {"_c":1,"DealHeader":1} |
| effector-model | {"_c":1,"DealHeader":1} |

### which components re-rendered after a paste (first run)
| app | components |
|---|---:|
| valtio | {"_c":1,"DealHeader":1} |
| mobx | {"_c":1,"DealHeader":1} |
| mobx-state-tree | {"_c":1,"DealHeader":1} |
| mobx-keystone | {"_c":1,"DealHeader":1} |
| legend-state | {"_c":1,"DealHeader":1} |
| redux | {"_c":1,"DealHeader":1} |
| zustand | {"_c":1,"DealHeader":1} |
| jotai | {"_c":1,"DealHeader":1} |
| effector-nested | {"_c":1,"DealHeader":1} |
| effector-model | {"_c":1,"DealHeader":1} |

### errors
| app | console errors |
|---|---:|
| valtio | 0 |
| mobx | 0 |
| mobx-state-tree | 0 |
| mobx-keystone | 0 |
| legend-state | 0 |
| redux | 0 |
| zustand | 0 |
| jotai | 0 |
| effector-nested | 0 |
| effector-model | 0 |
