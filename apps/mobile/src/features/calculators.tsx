import {
  CALCULATORS,
  type Calculator,
  type CalculatorKind,
  type ChoiceField,
  type FieldProblem,
  type NumberField,
  type Result,
  calculatorById,
  evaluate,
} from '@medconnect/calculators';
import { colors, semantic } from '@medconnect/ui-tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useLocale, useTranslations } from 'use-intl';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title } from '@/ui/kit';

/**
 * The clinical calculators (M30 plan §2), the same as the site's and from the same package. They
 * work without a connection; what is typed stays on the phone (plan §3). Open to visitors too.
 */

const KINDS: CalculatorKind[] = ['questionnaire', 'score', 'formula'];

export function CalculatorList() {
  const t = useTranslations('calculators');
  const router = useRouter();
  return (
    <Screen>
      <Back />
      <Title>{t('list.title')}</Title>
      <Body>{t('list.intro')}</Body>
      {KINDS.map((kind) => (
        <Card key={kind}>
          <Heading>{t(`list.kinds.${kind}`)}</Heading>
          {CALCULATORS.filter((c) => c.kind === kind).map((calculator) => (
            <View key={calculator.id} style={styles.item}>
              <Button
                label={t(`items.${calculator.id}.name`)}
                variant="secondary"
                hint={t(`items.${calculator.id}.summary`)}
                onPress={() => router.push(`/calculators/${calculator.id}`)}
              />
              {!calculator.review && <Text style={styles.warning}>{t('list.notReviewed')}</Text>}
            </View>
          ))}
        </Card>
      ))}
      <Body muted>{t('list.notIncluded')}</Body>
    </Screen>
  );
}

export function CalculatorScreen({ id }: { id: string }) {
  const calculator = calculatorById(id);
  const t = useTranslations('common.notFound');
  if (!calculator) {
    return (
      <Screen>
        <Back />
        <Notice tone="error">{t('title')}</Notice>
      </Screen>
    );
  }
  return <Form calculator={calculator} />;
}

function Form({ calculator }: { calculator: Calculator }) {
  const t = useTranslations('calculators');
  const format = useFormatter();
  const locale = useLocale();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const item = (key: string) => t(`items.${calculator.id}.${key}`);
  const number = (value: number, decimals: number) =>
    format.number(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const change = (key: string, value: string) => {
    setRaw((current) => ({ ...current, [key]: value }));
    setResult(null);
  };
  const calculate = () => {
    const outcome = evaluate(calculator, raw);
    setProblems(outcome.ok ? [] : outcome.problems);
    setResult(outcome.ok ? outcome.result : null);
  };
  const clear = () => {
    setRaw({});
    setProblems([]);
    setResult(null);
  };

  const problemText = (problem: FieldProblem) => {
    switch (problem.code) {
      case 'required':
        return t('form.errors.required');
      case 'notNumber':
        return t('form.errors.notNumber', { decimals: problem.decimals });
      case 'outOfRange': {
        const decimals = Math.max(decimalsIn(problem.min), decimalsIn(problem.max));
        return t('form.errors.outOfRange', {
          min: number(problem.min, decimals),
          max: number(problem.max, decimals),
          unit: t(`units.${problem.unit}`),
        });
      }
    }
  };
  const errorsOf = (key: string) => problems.filter((p) => p.field === key).map(problemText);

  const unitOf = (field: NumberField) => {
    if (!field.unitFrom) return field.unit;
    const source = calculator.fields.find((f) => f.key === field.unitFrom?.field);
    const chosen = raw[field.unitFrom.field] ?? (source?.type === 'choice' ? source.initial : '');
    return chosen && field.unitFrom.ranges[chosen] ? chosen : field.unit;
  };

  const { reference, review, version } = calculator;
  const href = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
  return (
    <Screen>
      <Back />
      <Title>{item('name')}</Title>
      <Body>{item('summary')}</Body>
      {problems.length > 0 && <Notice tone="error">{t('form.fix')}</Notice>}
      {calculator.fields.map((field) => {
        const hint = t.has(`items.${calculator.id}.fields.${field.key}.hint`)
          ? item(`fields.${field.key}.hint`)
          : undefined;
        const label = item(`fields.${field.key}.label`);
        const errors = errorsOf(field.key);
        return (
          <View key={field.key} style={styles.field}>
            {field.type === 'choice' ? (
              <Options
                field={field}
                label={label}
                hint={hint}
                value={raw[field.key] ?? field.initial ?? ''}
                optionLabel={(option) => t(`options.${field.set}.${option}`)}
                onChange={(value) => change(field.key, value)}
              />
            ) : (
              <Field
                label={`${label} (${t(`units.${unitOf(field)}`)})`}
                hint={hint}
                keyboardType="decimal-pad"
                value={raw[field.key] ?? ''}
                onChangeText={(value) => change(field.key, value)}
              />
            )}
            {errors.map((error) => (
              <Text key={error} style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ))}
          </View>
        );
      })}
      <Button label={t('form.calculate')} onPress={calculate} />
      <Button label={t('form.clear')} variant="secondary" onPress={clear} />

      <Card>
        <Heading>{t('form.result')}</Heading>
        {result && (
          <View style={styles.result} accessibilityLiveRegion="polite">
            <Text style={styles.value}>
              {result.label ?? number(result.value, result.decimals)}
              {result.unit ? ` ${t(`units.${result.unit}`)}` : ''}
            </Text>
            {result.band && <Body>{item(`bands.${result.band}`)}</Body>}
            {result.parts && result.parts.length > 0 && (
              <>
                <Text style={styles.label}>{t('form.parts')}</Text>
                {result.parts.map((part) => (
                  <Body key={part.key}>
                    {`${item(`parts.${part.key}`)}: ${
                      typeof part.value === 'number'
                        ? number(part.value, part.decimals ?? 0)
                        : part.value
                    }${part.unit ? ` ${t(`units.${part.unit}`)}` : ''}`}
                  </Body>
                ))}
              </>
            )}
            {result.notes?.map((note) => (
              <Body key={note} muted>
                {item(`notes.${note}`)}
              </Body>
            ))}
          </View>
        )}
        {/* The disclaimer is always beside the result (plan §3). */}
        <Text style={styles.label}>{t('about.disclaimer')}</Text>
      </Card>

      <Card>
        <Heading>{t('about.source')}</Heading>
        <Body>{reference.citation}</Body>
        {href && (
          <Button
            label={reference.doi ? `doi:${reference.doi}` : href}
            variant="link"
            onPress={() => void Linking.openURL(href)}
          />
        )}
        {version && <Body>{t('about.version', { version })}</Body>}
        {review ? (
          <Body>
            {t('about.reviewed', {
              name: review.by,
              date: format.dateTime(new Date(`${review.on}T00:00:00Z`), {
                dateStyle: 'long',
                timeZone: 'UTC',
              }),
            })}
          </Body>
        ) : (
          <Text style={styles.warning}>{t('about.notReviewed')}</Text>
        )}
        {calculator.hebrewNotValidated && locale === 'he' && (
          <Body>{t('about.hebrewNotValidated')}</Body>
        )}
        <Body muted>{t('about.nothingStored')}</Body>
      </Card>
    </Screen>
  );
}

function decimalsIn(value: number): number {
  const text = String(value);
  const point = text.indexOf('.');
  return point < 0 ? 0 : text.length - point - 1;
}

/** One answer among several, one under another: a questionnaire's answers are long. */
function Options({
  field,
  label,
  hint,
  value,
  optionLabel,
  onChange,
}: {
  field: ChoiceField;
  label: string;
  hint?: string;
  value: string;
  optionLabel: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Body muted>{hint}</Body> : null}
      {field.options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityLabel={optionLabel(option)}
            accessibilityState={{ checked: selected }}
            style={[styles.option, selected && styles.optionOn]}
          >
            <View style={[styles.dot, selected && styles.dotOn]} />
            <Text style={styles.optionText}>{optionLabel(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { gap: 4 },
  field: { gap: 6 },
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
  error: { fontSize: 14, color: colors.danger[700] },
  warning: { fontSize: 14, fontWeight: '600', color: colors.warning[700] },
  result: { gap: 8 },
  value: { fontSize: 28, fontWeight: '600', color: colors.brand[900] },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  optionOn: { borderColor: semantic.primary, backgroundColor: colors.brand[50] },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.neutral[500],
  },
  dotOn: { borderColor: semantic.primary, backgroundColor: semantic.primary },
  optionText: { flex: 1, fontSize: 16, color: semantic.text },
});
