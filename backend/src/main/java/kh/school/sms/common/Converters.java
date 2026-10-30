package kh.school.sms.common;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Explicit converters are mandatory (spike finding): the SQLite driver's default mapping stores a LocalDate as
 * epoch milliseconds shifted by the PC's time zone. We store ISO text, scaled integers and 0/1 flags.
 */
public final class Converters {
    private Converters() {}

    @Converter
    public static class IsoDate implements AttributeConverter<LocalDate, String> {
        @Override public String convertToDatabaseColumn(LocalDate d) { return d == null ? null : d.toString(); }
        @Override public LocalDate convertToEntityAttribute(String s) { return s == null ? null : LocalDate.parse(s); }
    }

    @Converter
    public static class IsoInstant implements AttributeConverter<Instant, String> {
        @Override public String convertToDatabaseColumn(Instant i) { return i == null ? null : i.toString(); }
        @Override public Instant convertToEntityAttribute(String s) { return s == null ? null : Instant.parse(s); }
    }

    /** Two-decimal numbers (scores, money in major units) as scaled integers: 7.25 -> 725. */
    @Converter
    public static class ScaledDecimal implements AttributeConverter<BigDecimal, Long> {
        @Override public Long convertToDatabaseColumn(BigDecimal d) { return d == null ? null : d.movePointRight(2).longValueExact(); }
        @Override public BigDecimal convertToEntityAttribute(Long l) { return l == null ? null : BigDecimal.valueOf(l, 2); }
    }

    @Converter
    public static class BooleanInt implements AttributeConverter<Boolean, Integer> {
        @Override public Integer convertToDatabaseColumn(Boolean b) { return b == null ? null : (b ? 1 : 0); }
        @Override public Boolean convertToEntityAttribute(Integer i) { return i == null ? null : i != 0; }
    }
}
