package kh.school.sms.security;

/** The authenticated principal placed in the SecurityContext (the session token is its credential). */
public record AuthUser(long id, String username) {}
