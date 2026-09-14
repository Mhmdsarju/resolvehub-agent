import { ParsedLog } from "../parser/LogParser";
import { AlertRule, defaultRules } from "./defaultRules";

export interface MatchedAlert {
    rule: AlertRule;
    log: ParsedLog;
}

export class AlertRuleEngine {
    constructor(private readonly rules: AlertRule[] = defaultRules) {}

    evaluate(log: ParsedLog): MatchedAlert | null {
        const matchedRule = this.rules.find((rule) =>
            rule.pattern.test(log.message)
        );

        if (!matchedRule) {
            return null;
        }

        return {
            rule: matchedRule,
            log,
        };
    }
}