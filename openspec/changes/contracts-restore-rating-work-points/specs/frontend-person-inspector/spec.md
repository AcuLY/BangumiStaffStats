## ADDED Requirements

### Requirement: Render work scatter over quarterly means
The time chart SHALL render one dot per supplied work, horizontally distributed within its calendar quarter, and a separate line through backend quarterly means. Tooltips SHALL identify work title, date, work rating and quarter mean. Keyboard and nearest-point interaction SHALL navigate individual works. Quarter labels SHALL use 冬季, 春季, 夏季, 秋季, hiding when space is insufficient; years SHALL remain readable.

#### Scenario: Multiple works with equal ratings in a quarter
- **WHEN** a quarter contains several works including equal ratings
- **THEN** each remains a separately focusable dot and the line retains one quarterly-mean vertex

#### Scenario: Narrow chart
- **WHEN** quarter widths are below 24 pixels
- **THEN** season labels are hidden while spaced year labels remain and the chart does not scroll horizontally
