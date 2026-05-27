# Migration Guide: FEEL → JUEL (Camunda DMN → Flowable DMN)

## Context & Scope

This document maps every FEEL construct to its JUEL equivalent for an AI agent
performing automated Camunda-to-Flowable DMN migration. Each section covers
syntax, semantics, caveats, and rewrite rules.

It is also the source of truth for any DMN content we ship inside Flowatch
(modeler starters, e2e fixtures, deploy-time XML rewrites). The short rule:
**Flowable's DMN engine evaluates `<inputExpression>`, `<inputEntry>`, and
`<outputEntry>` text as JUEL — DMN S-FEEL is NOT supported.**

| Attribute            | FEEL / S-FEEL (Camunda 7+)                    | JUEL (Flowable OSS)                             |
|----------------------|-----------------------------------------------|--------------------------------------------------|
| Standard             | OMG DMN spec (ISO/IEC 19510)                  | JSR-245 (Jakarta EE Unified EL)                 |
| Implementation       | FEEL engine (built-in since Camunda 7.13)     | JUEL library                                    |
| Expression delimiters| No delimiters in input entries; `?` in output | Unary tests supported in input entries; `${...}` required in output entries |
| Null-safety          | Null-safe by spec                             | NPE risk — explicit null checks required        |
| Type system          | Rich: date, time, duration, range, context    | Java types only; no native temporal/range types |
| Used in              | Input entries, output entries, literal exprs  | Input entries, output entries, literal exprs    |

---

## 1. Expression Delimiter Rules

### 1.1 Input Entries (cell conditions)

Flowable retains support for **JUEL unary test syntax** in input entries: simple
comparison operators (`<`, `<=`, `>`, `>=`) and string/number literals work
**without** wrapping in `${...}` and **without** naming the input variable
explicitly. The engine infers the variable from the `<input>` element's expression.

```
# FEEL — unary test, no delimiter
< 100
[18..65]
"gold", "silver"
not("bronze")
```

```
# JUEL input entry — unary tests: still valid in Flowable as-is
< 100             ← supported, variable inferred from <input> column
<= 100            ← supported
> 100             ← supported
>= 100            ← supported
"gold"            ← supported (equality)
```

```
# JUEL input entry — full boolean expression (required for compound logic)
${amount < 100}
${age >= 18 && age <= 65}
${tier == 'gold' || tier == 'silver'}
${tier != 'bronze'}
```

> **Rewrite rule:**
> - Simple unary comparisons (`< 100`, `>= 0`, `"active"`) → **keep as-is**, no change needed.
> - Ranges (`[18..65]`), negations (`not(...)`), list alternatives (`"a","b"`),
>   and any compound logic → **must be rewritten** as full `${...}` JUEL expressions.
> - When using full `${...}` expressions, the input variable must be named
>   explicitly; the name comes from the variable bound to the `<input>` column
>   in the Flowable execution context.

### 1.2 Output Entries and Literal Expressions

```
# FEEL
"APPROVED"
amount * 1.2
date("2024-01-01")
```

```
# JUEL
${"APPROVED"}     <!-- string literal needs quotes inside ${} -->
${amount * 1.2}
<!-- date literal: use Java helper or pre-computed variable -->
```

---

## 1.3 CDATA Blocks — Mandatory for Complex JUEL Expressions

When `${...}` expressions contain characters that are special in XML (`<`, `>`,
`&&`, `"`) they **must** be wrapped in a `<![CDATA[...]]>` block. This is the
preferred approach over XML entity escaping (`&amp;&amp;`, `&lt;`, etc.), which
is error-prone and unreadable.

**Rule for the migration agent:**
> Any `<text>` element whose content contains `${...}` **must** be wrapped in CDATA.
> Unary test cells (`< 100`, `"gold"`) do not need CDATA.

```xml
<!-- ❌ Without CDATA — XML-invalid or unreadable -->
<inputEntry>
  <text>${age >= 18 &amp;&amp; age &lt; 65}</text>
</inputEntry>

<!-- ✅ With CDATA — clean and safe -->
<inputEntry>
  <text><![CDATA[${age >= 18 && age < 65}]]></text>
</inputEntry>
```

Characters triggering mandatory CDATA:

| Character | XML escape     | In JUEL context            |
|-----------|----------------|----------------------------|
| `<`       | `&lt;`         | Less-than operator         |
| `>`       | `&gt;`         | Greater-than operator      |
| `&&`      | `&amp;&amp;`   | Boolean AND                |
| `"`       | `&quot;`       | String literal (use `'` instead when possible) |

> **Agent implementation note:** Systematically wrap every generated `<text>`
> containing `${...}` in `<![CDATA[...]]>`. Do not attempt character-by-character
> escaping. CDATA and `${...}` are fully compatible with Flowable's DMN parser.

| FEEL                  | JUEL (input entry)          | Notes                                              |
|-----------------------|-----------------------------|---------------------------------------------------|
| `< 100`               | `< 100`                     | ✅ Unary test kept as-is in Flowable               |
| `<= 100`              | `<= 100`                    | ✅ Unary test kept as-is                           |
| `> 100`               | `> 100`                     | ✅ Unary test kept as-is                           |
| `>= 100`              | `>= 100`                    | ✅ Unary test kept as-is                           |
| `100`  *(exact match)*| `100` or `${x == 100}`      | Bare number still works as equality in input entry |
| `"gold"` *(exact)*    | `"gold"` or `${x == 'gold'}`| Bare string still works; `'` required inside `${}` |
| `-`    *(any/skip)*   | *(leave cell empty)*        | Both engines skip empty input cells               |

---

## 3. Range (Interval) Expressions

FEEL has native interval syntax. JUEL has none — use compound boolean expressions.

| FEEL             | Semantics                  | JUEL equivalent                             |
|------------------|----------------------------|---------------------------------------------|
| `[18..65]`       | 18 ≤ x ≤ 65 (inclusive)   | `${x >= 18 && x <= 65}`                    |
| `(18..65)`       | 18 < x < 65 (exclusive)   | `${x > 18 && x < 65}`                      |
| `[18..65)`       | 18 ≤ x < 65               | `${x >= 18 && x < 65}`                     |
| `(18..65]`       | 18 < x ≤ 65               | `${x > 18 && x <= 65}`                     |
| `< 18, >= 65`    | x < 18 OR x >= 65         | `${x < 18 \|\| x >= 65}`                   |
| `[1..10],[20..30]`| x in [1,10] or [20,30]   | `${(x>=1&&x<=10)\|\|(x>=20&&x<=30)}`       |

---

## 4. Negation

| FEEL                  | JUEL                                     |
|-----------------------|------------------------------------------|
| `not("gold")`         | `${x != 'gold'}`                         |
| `not("a","b")`        | `${x != 'a' && x != 'b'}`               |
| `not([1..10])`        | `${x < 1 \|\| x > 10}`                  |
| `not(< 18)`           | `${x >= 18}`                             |

---

## 5. Null / Empty Checks

| FEEL                          | JUEL                                           |
|-------------------------------|------------------------------------------------|
| `null`  *(exact null match)*  | `${x == null}`                                 |
| `not(null)`                   | `${x != null}`                                 |
| *(implicit null-safe eval)*   | `${x != null && x > 0}` — always guard first   |

> **⚠️ Critical:** FEEL is null-safe by spec (null comparisons never throw).
> JUEL will throw `ELException` / NPE on `${null > 0}`. Every JUEL expression
> accessing a potentially-null variable **must** include a null guard.

---

## 6. String Operations

| FEEL                                    | JUEL                                                  | Notes                              |
|-----------------------------------------|-------------------------------------------------------|------------------------------------|
| `"gold"` *(equality)*                   | `${x == 'gold'}`                                      | Quote style differs                |
| `string length(x) > 5`                 | `${x.length() > 5}`                                   | FEEL built-in → Java method        |
| `starts with(x, "A")`                  | `${x.startsWith('A')}`                                |                                    |
| `ends with(x, "Z")`                    | `${x.endsWith('Z')}`                                  |                                    |
| `contains(x, "foo")`                   | `${x.contains('foo')}`                                |                                    |
| `upper case(x)`                         | `${x.toUpperCase()}`                                  |                                    |
| `lower case(x)`                         | `${x.toLowerCase()}`                                  |                                    |
| `substring(x, 2, 4)`                   | `${x.substring(1, 5)}`                                | ⚠️ FEEL is 1-indexed, Java 0-indexed |
| `string(x)`                             | `${String.valueOf(x)}` or `${"" + x}`                 |                                    |
| `matches(x, "[A-Z]+")`                  | `${x.matches('[A-Z]+')}`                              |                                    |

---

## 7. Numeric Operations

| FEEL                    | JUEL                            | Notes                                      |
|-------------------------|---------------------------------|--------------------------------------------|
| `floor(x)`              | `${Math.floor(x)}`              |                                            |
| `ceiling(x)`            | `${Math.ceil(x)}`               |                                            |
| `round(x, 2)`           | *(no direct EL equivalent)*     | Use a Spring bean: `${mathHelper.round(x,2)}` |
| `abs(x)`                | `${Math.abs(x)}`                |                                            |
| `modulo(x, 3)`          | `${x % 3}`                      |                                            |
| `sqrt(x)`               | `${Math.sqrt(x)}`               |                                            |
| `sum([1,2,3])`          | *(no native list in JUEL)*      | Pre-compute and pass as process variable   |
| `min([1,2,3])`          | *(same)*                        | Same                                       |
| `max([1,2,3])`          | *(same)*                        | Same                                       |
| `mean([1,2,3])`         | *(same)*                        | Same                                       |

---

## 8. Boolean Logic

| FEEL                            | JUEL                              |
|---------------------------------|-----------------------------------|
| `true`                          | `${true}`                         |
| `false`                         | `${false}`                        |
| `a and b`                       | `${a && b}`                       |
| `a or b`                        | `${a \|\| b}`                     |
| `not(a)`                        | `${!a}`                           |
| `not(a and b)`                  | `${!(a && b)}`                    |

---

## 9. Date and Time — ⚠️ Major Migration Challenge

FEEL has native temporal types. JUEL has none; all dates are Java objects
passed as process variables.

### 9.1 Date Literals

```
# FEEL — native literal
date("2024-06-15")
```

```
# JUEL — no literal syntax; must come from a process variable or helper bean
${orderDate}                               // orderDate is a java.time.LocalDate variable
${dateHelper.parse("2024-06-15")}          // via Spring bean
```

### 9.2 Date Comparisons

| FEEL                                           | JUEL                                                         |
|------------------------------------------------|--------------------------------------------------------------|
| `date("2024-01-01") <= contractDate`           | `${contractDate.isAfter(dateHelper.of(2024,1,1)) \|\| contractDate.isEqual(dateHelper.of(2024,1,1))}` |
| `today()`                                       | `${clockHelper.today()}`  — via Spring bean                  |
| `now()`                                         | `${clockHelper.now()}`    — via Spring bean                  |
| `day of week(d) = "Monday"`                    | `${d.getDayOfWeek().name() == 'MONDAY'}`                     |
| `day of year(d)`                               | `${d.getDayOfYear()}`                                        |
| `week of year(d)`                              | `${d.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR)}` |
| `month of year(d)`                             | `${d.getMonthValue()}`                                       |

### 9.3 Duration

| FEEL                                           | JUEL                                                         |
|------------------------------------------------|--------------------------------------------------------------|
| `duration("P1Y2M")`                            | `${java.time.Period.of(1,2,0)}`  — verbose, prefer bean      |
| `duration("PT4H30M")`                          | `${java.time.Duration.ofMinutes(270)}`                       |
| `d1 + duration("P1D")`                         | `${d1.plusDays(1)}`                                          |
| `months and days duration(d1, d2)`             | `${java.time.Period.between(d1, d2).getMonths()}`            |

> **Agent strategy:** Create a `DateHelper` Spring bean, expose it to the JUEL
> context, and rewrite all FEEL temporal built-ins as bean method calls.

```java
@Component("dateHelper")
public class DateHelper {
    public LocalDate parse(String iso) { return LocalDate.parse(iso); }
    public LocalDate today()           { return LocalDate.now(); }
    public LocalDate of(int y,int m,int d){ return LocalDate.of(y,m,d); }
    public boolean before(LocalDate a, LocalDate b) { return a.isBefore(b); }
    public boolean after(LocalDate a, LocalDate b)  { return a.isAfter(b); }
}
```

---

## 10. Lists and Collections

FEEL has native list syntax and quantifiers. JUEL operates on Java collections
passed as process variables.

### 10.1 List Membership Test

| FEEL                          | JUEL                                                      |
|-------------------------------|-----------------------------------------------------------|
| `x in ["a","b","c"]`          | `${'a'.equals(x) \|\| 'b'.equals(x) \|\| 'c'.equals(x)}` |
| `x in ["a","b","c"]` (long)   | `${listHelper.contains(myList, x)}`  — via bean           |
| `count(myList) > 2`           | `${myList.size() > 2}`                                    |
| `myList[1]`   *(1-indexed)*   | `${myList.get(0)}`  *(0-indexed)*                         |

### 10.2 Quantifiers — No JUEL Equivalent

```
# FEEL
some x in orders satisfies x.amount > 1000
every x in orders satisfies x.status == "APPROVED"
```

```
# JUEL — no native quantifier; must pre-compute and pass boolean as variable
# Pre-compute in a Java delegate or service:
boolean hasLargeOrder = orders.stream().anyMatch(o -> o.getAmount() > 1000);
execution.setVariable("hasLargeOrder", hasLargeOrder);

# Then in DMN:
${hasLargeOrder}
```

### 10.3 Context (Map) Access

| FEEL                          | JUEL                                    |
|-------------------------------|-----------------------------------------|
| `{a: 1, b: 2}`               | *(pass a Java Map as process variable)* |
| `ctx.a`                       | `${ctx.a}` or `${ctx['a']}`             |
| `get value(ctx, "a")`         | `${ctx.get('a')}`                       |

---

## 11. Conditional Expressions

| FEEL                                        | JUEL                                               |
|---------------------------------------------|----------------------------------------------------|
| `if x > 0 then "pos" else "non-pos"`        | `${x > 0 ? 'pos' : 'non-pos'}`                    |
| Nested if-then-else                         | Nested ternary (readability degrades — use rules)  |

---

## 12. Variable Access Patterns

| Concern                       | FEEL                         | JUEL                                       |
|-------------------------------|------------------------------|--------------------------------------------|
| Simple variable               | `amount`                     | `${amount}`                                |
| Nested property               | `order.customer.name`        | `${order.customer.name}`                   |
| Map/context property          | `order.status`               | `${order.status}` or `${order['status']}` |
| Method call                   | *(not idiomatic)*            | `${order.getStatus()}`                     |
| Spring bean                   | *(not supported)*            | `${myBean.compute(x)}`                     |
| Variable with spaces in name  | `` `my variable` ``          | *(not possible — rename variable)*         |

---

## 13. Function Definitions

### FEEL (inline function definition)
```
function(x, y) x + y
```

### JUEL
JUEL has no function definition syntax. Extract logic into a Spring bean:
```java
@Component("calcHelper")
public class CalcHelper {
    public double sum(double x, double y) { return x + y; }
}
```
Then in DMN output: `${calcHelper.sum(a, b)}`

---

## 14. Full DMN Cell Rewrite Examples

### Example 1 — Range input entry

```xml
<!-- FEEL (Camunda) -->
<inputEntry id="ie1">
  <text>[18..65]</text>
</inputEntry>

<!-- JUEL (Flowable) — CDATA required: contains && and >= -->
<inputEntry id="ie1">
  <text><![CDATA[${age >= 18 && age <= 65}]]></text>
</inputEntry>
```

### Example 2 — String list input entry

```xml
<!-- FEEL -->
<inputEntry><text>"gold","platinum"</text></inputEntry>

<!-- JUEL — CDATA required: contains || -->
<inputEntry><text><![CDATA[${tier == 'gold' || tier == 'platinum'}]]></text></inputEntry>
```

### Example 3 — Negation

```xml
<!-- FEEL -->
<inputEntry><text>not("rejected")</text></inputEntry>

<!-- JUEL — CDATA recommended for consistency with ${...} expressions -->
<inputEntry><text><![CDATA[${status != 'rejected'}]]></text></inputEntry>
```

### Example 4 — Date comparison

```xml
<!-- FEEL -->
<inputEntry><text>date("2024-01-01") <= contractDate</text></inputEntry>

<!-- JUEL (contractDate is a LocalDate process variable) — CDATA required -->
<inputEntry>
  <text><![CDATA[${!contractDate.isBefore(dateHelper.of(2024,1,1))}]]></text>
</inputEntry>
```

### Example 5 — Output literal string

```xml
<!-- FEEL -->
<outputEntry><text>"APPROVED"</text></outputEntry>

<!-- JUEL — CDATA recommended for all ${...} output entries -->
<outputEntry><text><![CDATA[${'APPROVED'}]]></text></outputEntry>
```

### Example 6 — Output computed value

```xml
<!-- FEEL -->
<outputEntry><text>amount * 1.2</text></outputEntry>

<!-- JUEL — no special chars here but CDATA is still the safe pattern -->
<outputEntry><text><![CDATA[${amount * 1.2}]]></text></outputEntry>
```

### Example 7 — Null check

```xml
<!-- FEEL (null-safe natively) -->
<inputEntry><text>not(null)</text></inputEntry>

<!-- JUEL — CDATA required: contains != -->
<inputEntry><text><![CDATA[${myVar != null}]]></text></inputEntry>
```

### Example 8 — Quantifier (pre-computation pattern)

```xml
<!-- FEEL -->
<inputEntry><text>some x in lineItems satisfies x.amount > 1000</text></inputEntry>

<!-- JUEL: cannot express this — pre-compute in Java delegate -->
<!-- Java delegate: execution.setVariable("hasHighValueItem", ...) -->
<inputEntry><text><![CDATA[${hasHighValueItem}]]></text></inputEntry>
```

### Example 9 — Unary test (no rewrite needed, no CDATA needed)

```xml
<!-- FEEL (Camunda) -->
<inputEntry><text>< 100</text></inputEntry>

<!-- JUEL (Flowable) — identical, unary test is natively supported -->
<inputEntry><text>< 100</text></inputEntry>
```

---

## 15. DMN XML Namespace Migration

```xml
<!-- Camunda DMN -->
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:camunda="http://camunda.org/schema/1.0/dmn"
             namespace="http://camunda.org/schema/1.0/dmn">

<!-- Flowable DMN -->
<definitions xmlns="http://www.omg.org/spec/DMN/20151101/dmn.xsd"
             xmlns:flowable="http://flowable.org/dmn"
             namespace="http://www.flowable.org/test">
```

Attribute prefix changes:
| Camunda attribute           | Flowable attribute              |
|-----------------------------|---------------------------------|
| `camunda:inputVariable`     | *(specify variable name in input label)* |
| `camunda:historyTimeToLive` | *(not available in Flowable OSS)* |

---

## 16. Operator and Syntax Quick Reference

| Construct                | FEEL syntax             | JUEL syntax                                  |
|--------------------------|-------------------------|----------------------------------------------|
| Equal                    | `"x"` or `x`           | `"x"` (input) / `<![CDATA[${'x'}]]>` (output) |
| Not equal                | `not("x")`              | `<![CDATA[${var != 'x'}]]>`                  |
| Less than                | `< 10`                  | `< 10` ✅ unary kept / or `<![CDATA[${var < 10}]]>` |
| Less or equal            | `<= 10`                 | `<= 10` ✅ unary kept                         |
| Greater than             | `> 10`                  | `> 10` ✅ unary kept                          |
| Greater or equal         | `>= 10`                 | `>= 10` ✅ unary kept                         |
| Closed range             | `[1..10]`               | `<![CDATA[${var >= 1 && var <= 10}]]>`        |
| Open range               | `(1..10)`               | `<![CDATA[${var > 1 && var < 10}]]>`          |
| Any / skip               | `-`                     | *(empty cell)*                               |
| Null                     | `null`                  | `<![CDATA[${var == null}]]>`                 |
| Boolean AND              | `a and b`               | `<![CDATA[${a && b}]]>`                      |
| Boolean OR               | `a or b`                | `<![CDATA[${a \|\| b}]]>`                    |
| Negation                 | `not(...)`              | `<![CDATA[${!...}]]>`                        |
| Ternary                  | `if c then a else b`    | `<![CDATA[${c ? a : b}]]>`                   |
| String concat            | `a + b`                 | `<![CDATA[${"" + a + b}]]>`                  |
| List membership          | `x in [a,b,c]`          | `<![CDATA[${x==a \|\| x==b \|\| x==c}]]>`   |
| Quantifier               | `some x in L satisfies` | *(pre-compute as variable)*                  |
| Date literal             | `date("yyyy-MM-dd")`    | `<![CDATA[${dateHelper.parse("yyyy-MM-dd")}]]>` |
| Duration literal         | `duration("P1D")`       | `<![CDATA[${java.time.Duration.ofDays(1)}]]>` |

---

## 17. Migration Checklist for AI Agent

### Per-DMN-file steps

- [ ] Update XML namespace: `camunda:` → `flowable:` (or remove if not needed)
- [ ] For each `<inputEntry>`:
  - [ ] Identify the FEEL construct category (unary, range, negation, list, date, etc.)
  - [ ] **Unary tests** (`< 18`, `>= 100`, `"active"`, bare number): **keep as-is** — Flowable supports them natively, no CDATA needed
  - [ ] **Compound expressions** (ranges, negations, lists, date logic): rewrite as `${...}` per sections 3–11
  - [ ] Wrap every `${...}` expression in `<![CDATA[...]]>` — do not use XML entity escaping
  - [ ] Add null guard if variable may be null
- [ ] For each `<outputEntry>`:
  - [ ] Wrap string literals: `"x"` → `<![CDATA[${'x'}]]>`
  - [ ] Numeric/computed expressions: `<![CDATA[${expr}]]>`
  - [ ] Date/duration outputs: replace with Java expression or bean call, wrapped in CDATA
- [ ] For each temporal expression: register and inject `DateHelper` bean
- [ ] For each quantifier (`some`, `every`): add Java delegate to pre-compute boolean
- [ ] For each list operation on a FEEL list literal: convert to Java Collection variable
- [ ] For each `string length`, `starts with`, etc.: convert to Java String method
- [ ] For each `substring`: adjust index from 1-based (FEEL) to 0-based (Java)
- [ ] Validate that all variable names referenced in JUEL exist in the Flowable execution context
- [ ] Test with Flowable `DmnRuleService.executeDecisionWithAuditTrail()`

### Helper bean registration

Register the following beans in the Spring context so they are resolvable in JUEL expressions:

```java
@Component("dateHelper")   // for date literals and comparisons
@Component("mathHelper")   // for round(), etc.
@Component("listHelper")   // for contains(), size() on arbitrary collections
@Component("clockHelper")  // for today(), now()
```

Expose beans to Flowable's EL context by registering a custom `ELResolver` or
via `EngineConfigurationConfigurer<SpringProcessEngineConfiguration>`:

```java
@Bean
public EngineConfigurationConfigurer<SpringProcessEngineConfiguration> elConfigurer(
        ApplicationContext ctx) {
    return cfg -> cfg.getBeans().putAll(
        ctx.getBeansWithAnnotation(Component.class)
    );
}
```

---

## 18. Constructs With No JUEL Equivalent — Resolution Strategy

| FEEL construct                 | Resolution                                                   |
|--------------------------------|--------------------------------------------------------------|
| `some x in L satisfies expr`   | Pre-compute boolean in Java delegate, pass as process variable |
| `every x in L satisfies expr`  | Same                                                         |
| `for x in L return expr`       | Pre-compute list in Java delegate                            |
| `function(x) ...`              | Extract to Spring bean method                                |
| `date/time("2024-01-01T09:00")`| Use Java bean returning `LocalDateTime`                      |
| `days and time duration`       | Use `java.time.Duration` via bean                            |
| `years and months duration`    | Use `java.time.Period` via bean                              |
| `` `variable with spaces` ``   | Rename variable (no spaces allowed in JUEL identifiers)      |
| `context()[...]` filter        | Pre-compute filtered list in Java delegate                   |
| `string(x, "%-10s")`           | `${String.format('%-10s', x)}`                               |

---

## How this guide is applied in Flowatch

- [`src/modeler/starters.ts`](../src/modeler/starters.ts) — `LOAN_DMN_XML` and
  `BLANK_DMN_XML` use JUEL throughout. The LOAN starter was rewritten on
  2026-05-27 after live-engine probing showed FEEL ranges (`[700..800)`) and
  list alternatives (`"employed","self-employed"`) silently aborted execution.
- [`e2e/fixtures/sample.dmn`](../e2e/fixtures/sample.dmn) — same rewrite for
  the `[50..80)` range cell.
- [`src/lib/dmn-parser.ts`](../src/lib/dmn-parser.ts) — `isComplex` flags
  `<inputExpression><text>` values that aren't simple JUEL identifiers; the
  execute modal falls back to JSON mode for those.
- See [RC-13](runtime-caveats.md#rc-13--dmn-rule-cells-are-juel-not-feel) for
  the symptom signature when this rule is violated.
