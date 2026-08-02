package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    Optional<User> findByOauthProviderAndOauthProviderId(String oauthProvider, String oauthProviderId);
    Optional<User> findByEmailVerificationToken(String emailVerificationToken);
    Optional<User> findByResetTokenHash(String resetTokenHash);
    List<User> findAllByTeamId(UUID teamId);
}
