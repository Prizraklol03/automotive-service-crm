from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


class RussianMoneyTextService:
    UNITS = {
        "masculine": ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
        "feminine": ["ноль", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
    }
    TEENS = {
        10: "десять",
        11: "одиннадцать",
        12: "двенадцать",
        13: "тринадцать",
        14: "четырнадцать",
        15: "пятнадцать",
        16: "шестнадцать",
        17: "семнадцать",
        18: "восемнадцать",
        19: "девятнадцать",
    }
    TENS = {
        2: "двадцать",
        3: "тридцать",
        4: "сорок",
        5: "пятьдесят",
        6: "шестьдесят",
        7: "семьдесят",
        8: "восемьдесят",
        9: "девяносто",
    }
    HUNDREDS = {
        1: "сто",
        2: "двести",
        3: "триста",
        4: "четыреста",
        5: "пятьсот",
        6: "шестьсот",
        7: "семьсот",
        8: "восемьсот",
        9: "девятьсот",
    }
    GROUPS = [
        ("рубль", "рубля", "рублей", "masculine"),
        ("тысяча", "тысячи", "тысяч", "feminine"),
        ("миллион", "миллиона", "миллионов", "masculine"),
        ("миллиард", "миллиарда", "миллиардов", "masculine"),
    ]

    def format(self, amount: Decimal) -> str:
        normalized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        rubles = int(normalized)
        kopecks = int((normalized - Decimal(rubles)).scaleb(2))

        rubles_text = self._number_to_words(rubles)
        result = rubles_text[:1].upper() + rubles_text[1:]
        if kopecks:
            result = f"{result} {kopecks:02d} {self._pluralize(kopecks, ('копейка', 'копейки', 'копеек'))}"
        return result

    def _number_to_words(self, number: int) -> str:
        if number == 0:
            return "ноль рублей"

        parts: list[str] = []
        group_index = 0
        had_rubles_group = False
        while number > 0:
            number, group_value = divmod(number, 1000)
            if group_value:
                parts.append(self._group_to_words(group_value, group_index))
                if group_index == 0:
                    had_rubles_group = True
            group_index += 1
        text = " ".join(reversed([part for part in parts if part])).strip()
        if not had_rubles_group:
            text = f"{text} рублей"
        return text.strip()

    def _group_to_words(self, value: int, group_index: int) -> str:
        one, two, five, gender = self.GROUPS[group_index]
        words: list[str] = []
        hundreds, remainder = divmod(value, 100)
        tens, units = divmod(remainder, 10)

        if hundreds:
            words.append(self.HUNDREDS[hundreds])
        if remainder in self.TEENS:
            words.append(self.TEENS[remainder])
        else:
            if tens:
                words.append(self.TENS.get(tens, ""))
            if units:
                words.append(self.UNITS[gender][units])

        words = [word for word in words if word]
        words.append(self._pluralize(value, (one, two, five)))
        return " ".join(words)

    def _pluralize(self, value: int, forms: tuple[str, str, str]) -> str:
        remainder_100 = value % 100
        remainder_10 = value % 10
        if 11 <= remainder_100 <= 19:
            return forms[2]
        if remainder_10 == 1:
            return forms[0]
        if 2 <= remainder_10 <= 4:
            return forms[1]
        return forms[2]
