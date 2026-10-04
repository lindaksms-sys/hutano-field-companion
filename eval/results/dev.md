# dev results (6 cases)

## rules

| slice | precision | recall | false positives | correct abstentions |
|---|---|---|---|---|
| ALL|ALL | 100% (17/17) | 59% (17/29) | 0 | 100% (19/19) |
| ALL|age | 100% (3/3) | 75% (3/4) | 0 | 100% (2/2) |
| ALL|concern | n/a (0/0) | 0% (0/4) | 0 | 100% (2/2) |
| ALL|duration | 100% (4/4) | 100% (4/4) | 0 | 100% (2/2) |
| ALL|encounterDate | 100% (2/2) | 100% (2/2) | 0 | 100% (4/4) |
| ALL|followUp | n/a (0/0) | 0% (0/2) | 0 | 100% (4/4) |
| ALL|location | 100% (3/3) | 100% (3/3) | 0 | 100% (3/3) |
| ALL|observations | n/a (0/0) | 0% (0/5) | 0 | 100% (1/1) |
| ALL|patientCode | 100% (5/5) | 100% (5/5) | 0 | 100% (1/1) |
| en|ALL | 100% (7/7) | 64% (7/11) | 0 | 100% (13/13) |
| en|age | 100% (1/1) | 100% (1/1) | 0 | 100% (2/2) |
| en|concern | n/a (0/0) | 0% (0/1) | 0 | 100% (2/2) |
| en|duration | 100% (1/1) | 100% (1/1) | 0 | 100% (2/2) |
| en|encounterDate | 100% (2/2) | 100% (2/2) | 0 | 100% (1/1) |
| en|followUp | n/a (0/0) | 0% (0/1) | 0 | 100% (2/2) |
| en|location | 100% (1/1) | 100% (1/1) | 0 | 100% (2/2) |
| en|observations | n/a (0/0) | 0% (0/2) | 0 | 100% (1/1) |
| en|patientCode | 100% (2/2) | 100% (2/2) | 0 | 100% (1/1) |
| mixed|ALL | 100% (2/2) | 40% (2/5) | 0 | 100% (3/3) |
| mixed|age | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|concern | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|duration | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| mixed|encounterDate | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|followUp | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|location | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|observations | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|patientCode | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| sn|ALL | 100% (8/8) | 62% (8/13) | 0 | 100% (3/3) |
| sn|age | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |
| sn|concern | n/a (0/0) | 0% (0/2) | 0 | n/a (0/0) |
| sn|duration | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |
| sn|encounterDate | n/a (0/0) | n/a (0/0) | 0 | 100% (2/2) |
| sn|followUp | n/a (0/0) | 0% (0/1) | 0 | 100% (1/1) |
| sn|location | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |
| sn|observations | n/a (0/0) | 0% (0/2) | 0 | n/a (0/0) |
| sn|patientCode | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |

## baseline

| slice | precision | recall | false positives | correct abstentions |
|---|---|---|---|---|
| ALL|ALL | 29% (5/17) | 17% (5/29) | 12 | 95% (18/19) |
| ALL|age | n/a (0/0) | 0% (0/4) | 0 | 100% (2/2) |
| ALL|concern | 0% (0/4) | 0% (0/4) | 4 | 100% (2/2) |
| ALL|duration | 0% (0/1) | 0% (0/4) | 1 | 100% (2/2) |
| ALL|encounterDate | 0% (0/1) | 0% (0/2) | 1 | 100% (4/4) |
| ALL|followUp | n/a (0/0) | 0% (0/2) | 0 | 100% (4/4) |
| ALL|location | 0% (0/4) | 0% (0/3) | 4 | 67% (2/3) |
| ALL|observations | 0% (0/2) | 0% (0/5) | 2 | 100% (1/1) |
| ALL|patientCode | 100% (5/5) | 100% (5/5) | 0 | 100% (1/1) |
| en|ALL | 29% (2/7) | 18% (2/11) | 5 | 100% (13/13) |
| en|age | n/a (0/0) | 0% (0/1) | 0 | 100% (2/2) |
| en|concern | 0% (0/1) | 0% (0/1) | 1 | 100% (2/2) |
| en|duration | 0% (0/1) | 0% (0/1) | 1 | 100% (2/2) |
| en|encounterDate | 0% (0/1) | 0% (0/2) | 1 | 100% (1/1) |
| en|followUp | n/a (0/0) | 0% (0/1) | 0 | 100% (2/2) |
| en|location | 0% (0/1) | 0% (0/1) | 1 | 100% (2/2) |
| en|observations | 0% (0/1) | 0% (0/2) | 1 | 100% (1/1) |
| en|patientCode | 100% (2/2) | 100% (2/2) | 0 | 100% (1/1) |
| mixed|ALL | 33% (1/3) | 20% (1/5) | 2 | 67% (2/3) |
| mixed|age | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|concern | 0% (0/1) | 0% (0/1) | 1 | n/a (0/0) |
| mixed|duration | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|encounterDate | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|followUp | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|location | 0% (0/1) | n/a (0/0) | 1 | 0% (0/1) |
| mixed|observations | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|patientCode | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| sn|ALL | 29% (2/7) | 15% (2/13) | 5 | 100% (3/3) |
| sn|age | n/a (0/0) | 0% (0/2) | 0 | n/a (0/0) |
| sn|concern | 0% (0/2) | 0% (0/2) | 2 | n/a (0/0) |
| sn|duration | n/a (0/0) | 0% (0/2) | 0 | n/a (0/0) |
| sn|encounterDate | n/a (0/0) | n/a (0/0) | 0 | 100% (2/2) |
| sn|followUp | n/a (0/0) | 0% (0/1) | 0 | 100% (1/1) |
| sn|location | 0% (0/2) | 0% (0/2) | 2 | n/a (0/0) |
| sn|observations | 0% (0/1) | 0% (0/2) | 1 | n/a (0/0) |
| sn|patientCode | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |

latency (model generate only, ms): median 9981, p95 14534, n=6

## hybrid

| slice | precision | recall | false positives | correct abstentions |
|---|---|---|---|---|
| ALL|ALL | 92% (23/25) | 79% (23/29) | 2 | 95% (18/19) |
| ALL|age | 100% (3/3) | 75% (3/4) | 0 | 100% (2/2) |
| ALL|concern | 75% (3/4) | 75% (3/4) | 1 | 50% (1/2) |
| ALL|duration | 100% (4/4) | 100% (4/4) | 0 | 100% (2/2) |
| ALL|encounterDate | 100% (2/2) | 100% (2/2) | 0 | 100% (4/4) |
| ALL|followUp | n/a (0/0) | 0% (0/2) | 0 | 100% (4/4) |
| ALL|location | 100% (3/3) | 100% (3/3) | 0 | 100% (3/3) |
| ALL|observations | 75% (3/4) | 60% (3/5) | 1 | 100% (1/1) |
| ALL|patientCode | 100% (5/5) | 100% (5/5) | 0 | 100% (1/1) |
| en|ALL | 82% (9/11) | 82% (9/11) | 2 | 92% (12/13) |
| en|age | 100% (1/1) | 100% (1/1) | 0 | 100% (2/2) |
| en|concern | 50% (1/2) | 100% (1/1) | 1 | 50% (1/2) |
| en|duration | 100% (1/1) | 100% (1/1) | 0 | 100% (2/2) |
| en|encounterDate | 100% (2/2) | 100% (2/2) | 0 | 100% (1/1) |
| en|followUp | n/a (0/0) | 0% (0/1) | 0 | 100% (2/2) |
| en|location | 100% (1/1) | 100% (1/1) | 0 | 100% (2/2) |
| en|observations | 50% (1/2) | 50% (1/2) | 1 | 100% (1/1) |
| en|patientCode | 100% (2/2) | 100% (2/2) | 0 | 100% (1/1) |
| mixed|ALL | 100% (4/4) | 80% (4/5) | 0 | 100% (3/3) |
| mixed|age | n/a (0/0) | 0% (0/1) | 0 | n/a (0/0) |
| mixed|concern | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| mixed|duration | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| mixed|encounterDate | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|followUp | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|location | n/a (0/0) | n/a (0/0) | 0 | 100% (1/1) |
| mixed|observations | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| mixed|patientCode | 100% (1/1) | 100% (1/1) | 0 | n/a (0/0) |
| sn|ALL | 100% (10/10) | 77% (10/13) | 0 | 100% (3/3) |
| sn|age | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |
| sn|concern | 100% (1/1) | 50% (1/2) | 0 | n/a (0/0) |
| sn|duration | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |
| sn|encounterDate | n/a (0/0) | n/a (0/0) | 0 | 100% (2/2) |
| sn|followUp | n/a (0/0) | 0% (0/1) | 0 | 100% (1/1) |
| sn|location | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |
| sn|observations | 100% (1/1) | 50% (1/2) | 0 | n/a (0/0) |
| sn|patientCode | 100% (2/2) | 100% (2/2) | 0 | n/a (0/0) |

latency (model generate only, ms): median 4988, p95 6203, n=6
